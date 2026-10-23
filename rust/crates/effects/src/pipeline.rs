use std::collections::HashMap;

use bytemuck::{Pod, Zeroable};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{EffectPass, UniformValue};

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");
const COLOR_GRADE_SHADER_ID: &str = "color-grade";
const COLOR_GRADE_SHADER_SOURCE: &str = include_str!("shaders/color_grade.wgsl");
/// `lut3d:<id>` names an uploaded LUT (see `EffectPipeline::upsert_lut`).
const LUT_SHADER_PREFIX: &str = "lut3d:";
const LUT_SHADER_SOURCE: &str = include_str!("shaders/lut3d.wgsl");
const IDENTITY_LUT_ID: &str = "__identity";

/// Single-pass effects sharing the `StyliseUniforms` layout (see vignette.wgsl).
const STYLISE_SHADERS: [(&str, &str); 17] = [
    ("vignette", include_str!("shaders/vignette.wgsl")),
    ("film-grain", include_str!("shaders/film_grain.wgsl")),
    ("rgb-split", include_str!("shaders/rgb_split.wgsl")),
    ("vhs", include_str!("shaders/vhs.wgsl")),
    ("glow", include_str!("shaders/glow.wgsl")),
    ("sharpen", include_str!("shaders/sharpen.wgsl")),
    ("pixelate", include_str!("shaders/pixelate.wgsl")),
    ("mirror", include_str!("shaders/mirror.wgsl")),
    ("wave", include_str!("shaders/wave.wgsl")),
    ("posterize", include_str!("shaders/posterize.wgsl")),
    ("invert", include_str!("shaders/invert.wgsl")),
    ("sepia", include_str!("shaders/sepia.wgsl")),
    ("edge-detect", include_str!("shaders/edge_detect.wgsl")),
    ("denoise", include_str!("shaders/denoise.wgsl")),
    ("hdr-from-sdr", include_str!("shaders/hdr_from_sdr.wgsl")),
    ("hdr-preview", include_str!("shaders/hdr_preview.wgsl")),
    ("nadir", include_str!("shaders/nadir.wgsl")),
];

/// Every effect shader, by the id the editor names it with.
fn effect_shaders() -> impl Iterator<Item = (&'static str, &'static str)> {
    [
        (GAUSSIAN_BLUR_SHADER_ID, GAUSSIAN_BLUR_SHADER_SOURCE),
        (COLOR_GRADE_SHADER_ID, COLOR_GRADE_SHADER_SOURCE),
    ]
    .into_iter()
    .chain(STYLISE_SHADERS)
}

fn is_stylise_shader(id: &str) -> bool {
    STYLISE_SHADERS
        .iter()
        .any(|(stylise_id, _)| *stylise_id == id)
}

pub struct ApplyEffectsOptions<'a> {
    pub source: &'a wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub passes: &'a [EffectPass],
}

pub struct EffectPipeline {
    uniform_bind_group_layout: wgpu::BindGroupLayout,
    pipelines: HashMap<String, wgpu::RenderPipeline>,
    lut_bind_group_layout: wgpu::BindGroupLayout,
    lut_pipeline: wgpu::RenderPipeline,
    luts: HashMap<String, UploadedLut>,
}

struct UploadedLut {
    size: u32,
    bind_group: wgpu::BindGroup,
}

#[derive(Debug, Error)]
pub enum LutError {
    #[error("LUT size must be between 2 and 65, got {0}")]
    InvalidSize(u32),
    #[error("LUT data must be {expected} bytes (RGBA8, size^3 texels), got {actual}")]
    InvalidData { expected: usize, actual: usize },
}

#[derive(Debug, Error)]
pub enum EffectsError {
    #[error("At least one effect pass is required")]
    MissingEffectPasses,
    #[error("Unknown effect shader '{shader}'")]
    UnknownEffectShader { shader: String },
    #[error("Missing uniform '{uniform}' for shader '{shader}'")]
    MissingUniform { shader: String, uniform: String },
    #[error("Uniform '{uniform}' for shader '{shader}' must be a number")]
    InvalidNumberUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length}"
    )]
    InvalidVectorUniform {
        shader: String,
        uniform: String,
        expected_length: usize,
    },
    #[error("Shader '{shader}' does not support uniform '{uniform}'")]
    UnsupportedUniform { shader: String, uniform: String },
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EffectUniformBuffer {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct StyliseUniformBuffer {
    resolution: [f32; 2],
    time: f32,
    _pad: f32,
    p0: [f32; 4],
    p1: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LutUniformBuffer {
    size: f32,
    intensity: f32,
    _pad: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ColorGradeUniformBuffer {
    lift: [f32; 4],
    gamma: [f32; 4],
    gain: [f32; 4],
    offset: [f32; 4],
    tone: [f32; 4],
    balance: [f32; 4],
}

impl EffectPipeline {
    pub fn new(context: &GpuContext) -> Self {
        let uniform_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-uniform-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });
        let vertex_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-fullscreen-shader"),
                    source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
                });
        let pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        let lut_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-lut-bind-group-layout"),
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                multisampled: false,
                                view_dimension: wgpu::TextureViewDimension::D2,
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                            count: None,
                        },
                    ],
                });
        let lut_pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-lut-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                        Some(&lut_bind_group_layout),
                    ],
                    immediate_size: 0,
                });
        let build = |id: &str, source: &str, layout: &wgpu::PipelineLayout| {
            let shader_module =
                context
                    .device()
                    .create_shader_module(wgpu::ShaderModuleDescriptor {
                        label: Some(id),
                        source: wgpu::ShaderSource::Wgsl(source.into()),
                    });
            context
                .device()
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some(id),
                    layout: Some(layout),
                    vertex: wgpu::VertexState {
                        module: &vertex_shader_module,
                        entry_point: Some("vertex_main"),
                        buffers: &[wgpu::VertexBufferLayout {
                            array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        }],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &shader_module,
                        entry_point: Some("fragment_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: context.texture_format(),
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: wgpu::PipelineCompilationOptions::default(),
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                })
        };
        let pipelines = effect_shaders()
            .map(|(id, source)| (id.to_string(), build(id, source, &pipeline_layout)))
            .collect::<HashMap<_, _>>();
        let lut_pipeline = build("lut3d", LUT_SHADER_SOURCE, &lut_pipeline_layout);

        let mut pipeline = Self {
            uniform_bind_group_layout,
            pipelines,
            lut_bind_group_layout,
            lut_pipeline,
            luts: HashMap::new(),
        };
        let identity: Vec<u8> = (0..8u8)
            .flat_map(|i| [(i & 1) * 255, ((i >> 1) & 1) * 255, ((i >> 2) & 1) * 255, 255])
            .collect();
        pipeline
            .upsert_lut(context, IDENTITY_LUT_ID, 2, &identity)
            .expect("identity LUT is valid");
        pipeline
    }

    /// Uploads (or replaces) a 3D LUT. `rgba` holds size³ RGBA8 texels in
    /// .cube order (red fastest, then green, then blue).
    pub fn upsert_lut(
        &mut self,
        context: &GpuContext,
        id: &str,
        size: u32,
        rgba: &[u8],
    ) -> Result<(), LutError> {
        if !(2..=65).contains(&size) {
            return Err(LutError::InvalidSize(size));
        }
        let texels = (size * size * size) as usize;
        if rgba.len() != texels * 4 {
            return Err(LutError::InvalidData {
                expected: texels * 4,
                actual: rgba.len(),
            });
        }
        // Slices side by side: texel (r, g, b) goes to x = r + b * size, y = g.
        let width = size * size;
        let mut packed = vec![0u8; texels * 4];
        for b in 0..size {
            for g in 0..size {
                for r in 0..size {
                    let source = ((b * size * size + g * size + r) * 4) as usize;
                    let target = ((g * width + b * size + r) * 4) as usize;
                    packed[target..target + 4].copy_from_slice(&rgba[source..source + 4]);
                }
            }
        }
        let texture = context.device().create_texture_with_data(
            context.queue(),
            &wgpu::TextureDescriptor {
                label: Some("effects-lut-texture"),
                size: wgpu::Extent3d {
                    width,
                    height: size,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            },
            wgpu::util::TextureDataOrder::LayerMajor,
            &packed,
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("effects-lut-bind-group"),
                layout: &self.lut_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                    },
                ],
            });
        self.luts
            .insert(id.to_string(), UploadedLut { size, bind_group });
        Ok(())
    }

    pub fn has_lut(&self, id: &str) -> bool {
        self.luts.contains_key(id)
    }

    pub fn apply(
        &self,
        context: &GpuContext,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("effects-command-encoder"),
                });
        let output = self.apply_with_encoder(
            context,
            &mut encoder,
            ApplyEffectsOptions {
                source,
                width,
                height,
                passes,
            },
        )?;
        context.queue().submit([encoder.finish()]);
        Ok(output)
    }

    pub fn apply_with_encoder(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut current_texture: Option<wgpu::Texture> = None;

        for pass in passes {
            let lut = match pass.shader.strip_prefix(LUT_SHADER_PREFIX) {
                // A LUT that isn't uploaded yet uses the identity LUT, which
                // leaves the picture unchanged.
                Some(id) => Some(
                    self.luts
                        .get(id)
                        .or_else(|| self.luts.get(IDENTITY_LUT_ID))
                        .ok_or(EffectsError::MissingEffectPasses)?,
                ),
                None => None,
            };
            let input_texture = current_texture.as_ref().unwrap_or(source);
            let output_texture =
                context.create_render_texture(width, height, "effects-pass-output");
            let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let texture_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-texture-bind-group"),
                        layout: context.texture_sampler_bind_group_layout(),
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&input_view),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                            },
                        ],
                    });
            let uniform_buffer =
                context
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("effects-uniform-buffer"),
                        contents: &match lut {
                            Some(lut) => pack_lut_uniforms(pass, lut.size)?,
                            None => pack_effect_uniforms(pass, width, height)?,
                        },
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    });
            let uniform_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-uniform-bind-group"),
                        layout: &self.uniform_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: uniform_buffer.as_entire_binding(),
                        }],
                    });
            let pipeline = match lut {
                Some(_) => &self.lut_pipeline,
                None => self.pipelines.get(&pass.shader).ok_or_else(|| {
                    EffectsError::UnknownEffectShader {
                        shader: pass.shader.clone(),
                    }
                })?,
            };

            {
                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                if let Some(lut) = lut {
                    render_pass.set_bind_group(2, &lut.bind_group, &[]);
                }
                render_pass.draw(0..6, 0..1);
            }

            current_texture = Some(output_texture);
        }

        current_texture.ok_or(EffectsError::MissingEffectPasses)
    }
}

/// `u_intensity` (0–1) for a LUT pass; the size comes from the upload.
fn pack_lut_uniforms(pass: &EffectPass, size: u32) -> Result<Vec<u8>, EffectsError> {
    let intensity = match pass.uniforms.get("u_intensity") {
        Some(UniformValue::Number(value)) => *value,
        Some(_) => {
            return Err(EffectsError::InvalidNumberUniform {
                shader: pass.shader.clone(),
                uniform: "u_intensity".into(),
            });
        }
        None => 1.0,
    };
    Ok(bytemuck::bytes_of(&LutUniformBuffer {
        size: size as f32,
        intensity,
        _pad: [0.0; 2],
    })
    .to_vec())
}

fn pack_effect_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, EffectsError> {
    match pass.shader.as_str() {
        COLOR_GRADE_SHADER_ID => Ok(bytemuck::bytes_of(&pack_color_grade_uniforms(pass)?).to_vec()),
        id if is_stylise_shader(id) => {
            Ok(bytemuck::bytes_of(&pack_stylise_uniforms(pass, width, height)?).to_vec())
        }
        _ => Ok(bytemuck::bytes_of(&pack_blur_uniforms(pass, width, height)?).to_vec()),
    }
}

const COLOR_GRADE_UNIFORMS: [&str; 6] = [
    "u_lift",
    "u_gamma",
    "u_gain",
    "u_offset",
    "u_tone",
    "u_balance",
];

fn pack_color_grade_uniforms(pass: &EffectPass) -> Result<ColorGradeUniformBuffer, EffectsError> {
    reject_unknown_uniforms(pass, &COLOR_GRADE_UNIFORMS)?;
    Ok(ColorGradeUniformBuffer {
        lift: read_vec4_uniform(pass, "u_lift")?,
        gamma: read_vec4_uniform(pass, "u_gamma")?,
        gain: read_vec4_uniform(pass, "u_gain")?,
        offset: read_vec4_uniform(pass, "u_offset")?,
        tone: read_vec4_uniform(pass, "u_tone")?,
        balance: read_vec4_uniform(pass, "u_balance")?,
    })
}

const STYLISE_UNIFORMS: [&str; 3] = ["u_time", "u_p0", "u_p1"];

/// `u_p0` is required; `u_p1` and `u_time` default to zero.
fn pack_stylise_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<StyliseUniformBuffer, EffectsError> {
    reject_unknown_uniforms(pass, &STYLISE_UNIFORMS)?;
    let time = if pass.uniforms.contains_key("u_time") {
        read_number_uniform(pass, "u_time")?
    } else {
        0.0
    };
    let p1 = if pass.uniforms.contains_key("u_p1") {
        read_vec4_uniform(pass, "u_p1")?
    } else {
        [0.0; 4]
    };
    Ok(StyliseUniformBuffer {
        resolution: [width as f32, height as f32],
        time,
        _pad: 0.0,
        p0: read_vec4_uniform(pass, "u_p0")?,
        p1,
    })
}

fn reject_unknown_uniforms(pass: &EffectPass, known: &[&str]) -> Result<(), EffectsError> {
    match pass
        .uniforms
        .keys()
        .find(|key| !known.contains(&key.as_str()))
    {
        Some(uniform) => Err(EffectsError::UnsupportedUniform {
            shader: pass.shader.clone(),
            uniform: uniform.clone(),
        }),
        None => Ok(()),
    }
}

fn pack_blur_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let shader = pass.shader.as_str();
    let sigma = read_number_uniform(pass, "u_sigma")?;
    let step = read_number_uniform(pass, "u_step")?;
    let direction = read_vec2_uniform(pass, "u_direction")?;

    for uniform in pass.uniforms.keys() {
        if uniform == "u_sigma" || uniform == "u_step" || uniform == "u_direction" {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction,
        scalars: [sigma, step, 0.0, 0.0],
    })
}

fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec4_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 4], EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Vector(values) if values.len() == 4 => {
            Ok([values[0], values[1], values[2], values[3]])
        }
        _ => Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 4,
        }),
    }
}

fn read_vec2_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 2], EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let UniformValue::Vector(values) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    };
    if values.len() != 2 {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    }
    Ok([values[0], values[1]])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_effect_shader_is_valid_wgsl() {
        for (id, source) in effect_shaders() {
            let module = wgpu::naga::front::wgsl::parse_str(source)
                .unwrap_or_else(|error| panic!("{id}: {}", error.emit_to_string(source)));
            wgpu::naga::valid::Validator::new(
                wgpu::naga::valid::ValidationFlags::all(),
                wgpu::naga::valid::Capabilities::default(),
            )
            .validate(&module)
            .unwrap_or_else(|error| panic!("{id}: {error:?}"));
        }
    }

    #[test]
    fn lut_shader_is_valid_wgsl() {
        let module = wgpu::naga::front::wgsl::parse_str(LUT_SHADER_SOURCE)
            .unwrap_or_else(|error| panic!("{}", error.emit_to_string(LUT_SHADER_SOURCE)));
        wgpu::naga::valid::Validator::new(
            wgpu::naga::valid::ValidationFlags::all(),
            wgpu::naga::valid::Capabilities::default(),
        )
        .validate(&module)
        .unwrap_or_else(|error| panic!("{error:?}"));
        assert_eq!(std::mem::size_of::<LutUniformBuffer>(), 16);
        let pass = EffectPass {
            shader: "lut3d:x".into(),
            uniforms: [("u_intensity".to_string(), UniformValue::Number(0.5))]
                .into_iter()
                .collect(),
        };
        assert_eq!(pack_lut_uniforms(&pass, 33).unwrap().len(), 16);
    }

    #[test]
    fn stylise_uniforms_pack_with_defaults() {
        assert_eq!(std::mem::size_of::<StyliseUniformBuffer>(), 48);
        for (id, _) in STYLISE_SHADERS {
            let pass = EffectPass {
                shader: id.to_string(),
                uniforms: [(
                    "u_p0".to_string(),
                    UniformValue::Vector(vec![0.5, 0.0, 0.0, 0.0]),
                )]
                .into_iter()
                .collect(),
            };
            assert_eq!(
                pack_effect_uniforms(&pass, 640, 360).unwrap().len(),
                48,
                "{id}"
            );
        }
        let missing = EffectPass {
            shader: "vignette".into(),
            uniforms: Default::default(),
        };
        assert!(pack_effect_uniforms(&missing, 640, 360).is_err());
    }

    #[test]
    fn color_grade_uniforms_match_the_shader_layout() {
        // Six vec4f in color_grade.wgsl.
        assert_eq!(std::mem::size_of::<ColorGradeUniformBuffer>(), 6 * 16);
        let pass = EffectPass {
            shader: COLOR_GRADE_SHADER_ID.to_string(),
            uniforms: COLOR_GRADE_UNIFORMS
                .iter()
                .map(|name| {
                    (
                        name.to_string(),
                        UniformValue::Vector(vec![0.1, 0.2, 0.3, 0.4]),
                    )
                })
                .collect(),
        };
        assert_eq!(pack_effect_uniforms(&pass, 1920, 1080).unwrap().len(), 96);

        let mut missing = pass.clone();
        missing.uniforms.remove("u_tone");
        assert!(pack_effect_uniforms(&missing, 1920, 1080).is_err());

        let mut extra = pass.clone();
        extra
            .uniforms
            .insert("u_sigma".into(), UniformValue::Number(1.0));
        assert!(pack_effect_uniforms(&extra, 1920, 1080).is_err());
    }
}
