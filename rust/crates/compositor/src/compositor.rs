use bytemuck::{Pod, Zeroable};
use effects::{ApplyEffectsOptions, EffectPass, EffectPipeline, UniformValue};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext, wgpu};
use masks::{ApplyMaskFeatherOptions, MaskFeatherPipeline};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{
    BlendMode,
    frame::{
        EffectPassDescriptor, EffectUniformValueDescriptor, FrameDescriptor, FrameItemDescriptor,
        LayerDescriptor, LayerMaskDescriptor,
    },
    texture_pool::TexturePool,
    texture_store::TextureStore,
};

const LAYER_SHADER_SOURCE: &str = include_str!("shaders/layer.wgsl");
const BLEND_SHADER_SOURCE: &str = include_str!("shaders/blend.wgsl");
const MASK_SHADER_SOURCE: &str = include_str!("shaders/mask.wgsl");
const PROJECTION_SHADER_SOURCE: &str = include_str!("shaders/projection.wgsl");

pub struct RenderFrameOptions<'a, 'surface> {
    pub frame: &'a FrameDescriptor,
    pub surface: &'a wgpu::Surface<'surface>,
}

pub struct Compositor {
    textures: TextureStore,
    texture_pool: TexturePool,
    effects: EffectPipeline,
    masks: MaskFeatherPipeline,
    layer_uniform_bind_group_layout: wgpu::BindGroupLayout,
    layer_pipeline: wgpu::RenderPipeline,
    projection_pipeline: wgpu::RenderPipeline,
    blend_uniform_bind_group_layout: wgpu::BindGroupLayout,
    blend_pipeline: wgpu::RenderPipeline,
    mask_uniform_bind_group_layout: wgpu::BindGroupLayout,
    mask_pipeline: wgpu::RenderPipeline,
}

#[derive(Debug, Error)]
pub enum CompositorError {
    #[error("Texture '{texture_id}' is not available")]
    MissingTexture { texture_id: String },
    #[error("Failed to apply effects: {0}")]
    Effects(#[from] effects::EffectsError),
    #[error("Failed to present frame: {0}")]
    Gpu(#[from] gpu::GpuError),
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LayerUniformBuffer {
    resolution: [f32; 2],
    center: [f32; 2],
    size: [f32; 2],
    rotation_radians: f32,
    opacity: f32,
    flip_x: f32,
    flip_y: f32,
    _padding: [f32; 2], // WebGL requires uniform buffer sizes to be multiples of 16 bytes (40 → 48)
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ProjectionUniformBuffer {
    angles: [f32; 4],
    resolution: [f32; 2],
    lens: f32,
    mode: f32,
    opacity: f32,
    _padding: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct BlendUniformBuffer {
    blend_mode: u32,
    _padding: [u32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct MaskUniformBuffer {
    inverted: f32,
    _padding: [f32; 3],
}

impl Compositor {
    pub fn new(context: &GpuContext) -> Self {
        let device = context.device();
        let fullscreen_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("compositor-fullscreen-shader"),
            source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
        });
        let layer_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("compositor-layer-shader"),
            source: wgpu::ShaderSource::Wgsl(LAYER_SHADER_SOURCE.into()),
        });
        let projection_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("compositor-projection-shader"),
            source: wgpu::ShaderSource::Wgsl(PROJECTION_SHADER_SOURCE.into()),
        });
        let blend_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("compositor-blend-shader"),
            source: wgpu::ShaderSource::Wgsl(BLEND_SHADER_SOURCE.into()),
        });
        let mask_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("compositor-mask-shader"),
            source: wgpu::ShaderSource::Wgsl(MASK_SHADER_SOURCE.into()),
        });

        let layer_uniform_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("compositor-layer-uniform-layout"),
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
        let blend_uniform_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("compositor-blend-uniform-layout"),
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
        let mask_uniform_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("compositor-mask-uniform-layout"),
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

        let layer_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("compositor-layer-pipeline-layout"),
                bind_group_layouts: &[
                    Some(context.texture_sampler_bind_group_layout()),
                    Some(&layer_uniform_bind_group_layout),
                ],
                immediate_size: 0,
            });
        let blend_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("compositor-blend-pipeline-layout"),
                bind_group_layouts: &[
                    Some(context.texture_sampler_bind_group_layout()),
                    Some(context.texture_sampler_bind_group_layout()),
                    Some(&blend_uniform_bind_group_layout),
                ],
                immediate_size: 0,
            });
        let mask_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("compositor-mask-pipeline-layout"),
            bind_group_layouts: &[
                Some(context.texture_sampler_bind_group_layout()),
                Some(context.texture_sampler_bind_group_layout()),
                Some(&mask_uniform_bind_group_layout),
            ],
            immediate_size: 0,
        });

        let layer_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("compositor-layer-pipeline"),
            layout: Some(&layer_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &fullscreen_shader,
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
                module: &layer_shader,
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
        });
        let projection_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("compositor-projection-pipeline"),
            layout: Some(&layer_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &fullscreen_shader,
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
                module: &projection_shader,
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
        });
        let blend_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("compositor-blend-pipeline"),
            layout: Some(&blend_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &fullscreen_shader,
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
                module: &blend_shader,
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
        });
        let mask_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("compositor-mask-pipeline"),
            layout: Some(&mask_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &fullscreen_shader,
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
                module: &mask_shader,
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
        });

        Self {
            textures: TextureStore::default(),
            texture_pool: TexturePool::default(),
            effects: EffectPipeline::new(context),
            masks: MaskFeatherPipeline::new(context),
            layer_uniform_bind_group_layout,
            layer_pipeline,
            projection_pipeline,
            blend_uniform_bind_group_layout,
            blend_pipeline,
            mask_uniform_bind_group_layout,
            mask_pipeline,
        }
    }

    pub fn upsert_texture(&mut self, id: String, texture: wgpu::Texture) {
        self.textures.upsert(id, texture);
    }

    pub fn release_texture(&mut self, id: &str) {
        self.textures.remove(id);
    }

    /// Makes a 3D LUT available to `lut3d:<id>` effect passes.
    pub fn upsert_lut(
        &mut self,
        context: &GpuContext,
        id: &str,
        size: u32,
        rgba: &[u8],
    ) -> Result<(), effects::LutError> {
        self.effects.upsert_lut(context, id, size, rgba)
    }

    /// Composites all frame items into a texture and returns it.
    /// Used on backends that cannot surface-render to an arbitrary canvas (e.g. WebGL).
    pub fn render_frame_to_texture(
        &mut self,
        context: &GpuContext,
        frame: &FrameDescriptor,
    ) -> Result<wgpu::Texture, CompositorError> {
        self.texture_pool.recycle_frame();
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("compositor-frame-encoder"),
                });
        let mut scene = self.create_cleared_texture(
            context,
            &mut encoder,
            frame.width,
            frame.height,
            frame.clear.color,
        );

        for item in &frame.items {
            match item {
                FrameItemDescriptor::Layer(layer) => {
                    let layer_texture = self.render_layer(context, &mut encoder, frame, layer)?;
                    scene = self.blend_texture(
                        context,
                        &mut encoder,
                        &scene,
                        &layer_texture,
                        layer.blend_mode,
                        frame.width,
                        frame.height,
                    )?;
                }
                FrameItemDescriptor::SceneEffect {
                    effect_pass_groups,
                    mask,
                } => {
                    let effected = self.apply_effect_groups(
                        context,
                        &mut encoder,
                        &scene,
                        frame.width,
                        frame.height,
                        effect_pass_groups,
                    )?;
                    scene = match mask {
                        Some(mask) => {
                            let masked = self.mask_layer(
                                context,
                                &mut encoder,
                                &effected,
                                mask,
                                frame.width,
                                frame.height,
                            )?;
                            self.blend_texture(
                                context,
                                &mut encoder,
                                &scene,
                                &masked,
                                BlendMode::Normal,
                                frame.width,
                                frame.height,
                            )?
                        }
                        None => effected,
                    };
                }
            }
        }

        context.queue().submit([encoder.finish()]);
        Ok(scene)
    }

    pub fn render_frame(
        &mut self,
        context: &GpuContext,
        options: RenderFrameOptions<'_, '_>,
    ) -> Result<(), CompositorError> {
        let frame = options.frame;
        self.texture_pool.recycle_frame();
        let surface_texture = context.acquire_surface_texture(options.surface)?;
        let surface_view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("compositor-frame-encoder"),
                });
        let mut scene = self.create_cleared_texture(
            context,
            &mut encoder,
            frame.width,
            frame.height,
            frame.clear.color,
        );

        for item in &frame.items {
            match item {
                FrameItemDescriptor::Layer(layer) => {
                    let layer_texture = self.render_layer(context, &mut encoder, frame, layer)?;
                    scene = self.blend_texture(
                        context,
                        &mut encoder,
                        &scene,
                        &layer_texture,
                        layer.blend_mode,
                        frame.width,
                        frame.height,
                    )?;
                }
                FrameItemDescriptor::SceneEffect {
                    effect_pass_groups,
                    mask,
                } => {
                    let effected = self.apply_effect_groups(
                        context,
                        &mut encoder,
                        &scene,
                        frame.width,
                        frame.height,
                        effect_pass_groups,
                    )?;
                    scene = match mask {
                        Some(mask) => {
                            let masked = self.mask_layer(
                                context,
                                &mut encoder,
                                &effected,
                                mask,
                                frame.width,
                                frame.height,
                            )?;
                            self.blend_texture(
                                context,
                                &mut encoder,
                                &scene,
                                &masked,
                                BlendMode::Normal,
                                frame.width,
                                frame.height,
                            )?
                        }
                        None => effected,
                    };
                }
            }
        }

        context.encode_texture_blit_to_view(
            &mut encoder,
            &scene,
            &surface_view,
            context.surface_format(),
            "compositor-present-pass",
        );
        context.queue().submit([encoder.finish()]);
        surface_texture.present();
        Ok(())
    }

    fn render_layer(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        frame: &FrameDescriptor,
        layer: &LayerDescriptor,
    ) -> Result<wgpu::Texture, CompositorError> {
        let source = self.textures.get(&layer.texture_id).ok_or_else(|| {
            CompositorError::MissingTexture {
                texture_id: layer.texture_id.clone(),
            }
        })?;

        let mut current =
            self.texture_pool
                .acquire(context, frame.width, frame.height, "compositor-layer");
        self.render_source_to_texture(
            context,
            encoder,
            source.texture(),
            &current,
            frame.width,
            frame.height,
            layer,
        );

        if !layer.effect_pass_groups.is_empty() {
            current = self.apply_effect_groups(
                context,
                encoder,
                &current,
                frame.width,
                frame.height,
                &layer.effect_pass_groups,
            )?;
        }

        if let Some(mask) = &layer.mask {
            current =
                self.mask_layer(context, encoder, &current, mask, frame.width, frame.height)?;
        }

        Ok(current)
    }

    fn mask_layer(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::Texture,
        mask: &LayerMaskDescriptor,
        width: u32,
        height: u32,
    ) -> Result<wgpu::Texture, CompositorError> {
        let mask_source =
            self.textures
                .get(&mask.texture_id)
                .ok_or_else(|| CompositorError::MissingTexture {
                    texture_id: mask.texture_id.clone(),
                })?;
        let mask_source_texture = mask_source.texture().clone();
        let mask_texture = if mask.feather > 0.0 {
            self.masks.apply_mask_feather_with_encoder(
                context,
                encoder,
                ApplyMaskFeatherOptions {
                    mask: &mask_source_texture,
                    width,
                    height,
                    feather: mask.feather,
                },
            )
        } else {
            self.copy_texture(context, encoder, &mask_source_texture, width, height)
        };
        Ok(self.apply_mask(
            context,
            encoder,
            source,
            &mask_texture,
            mask.inverted,
            width,
            height,
        ))
    }

    fn apply_effect_groups(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::Texture,
        width: u32,
        height: u32,
        effect_pass_groups: &[Vec<EffectPassDescriptor>],
    ) -> Result<wgpu::Texture, CompositorError> {
        let mut current = self.copy_texture(context, encoder, source, width, height);
        for group in effect_pass_groups {
            let passes = map_effect_passes(group);
            current = self.effects.apply_with_encoder(
                context,
                encoder,
                ApplyEffectsOptions {
                    source: &current,
                    width,
                    height,
                    passes: &passes,
                },
            )?;
        }
        Ok(current)
    }

    fn create_cleared_texture(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        width: u32,
        height: u32,
        clear_color: [f32; 4],
    ) -> wgpu::Texture {
        let texture =
            self.texture_pool
                .acquire(context, width, height, "compositor-cleared-texture");
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        {
            let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("compositor-clear-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: clear_color[0] as f64,
                            g: clear_color[1] as f64,
                            b: clear_color[2] as f64,
                            a: clear_color[3] as f64,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
                multiview_mask: None,
            });
        }
        texture
    }

    fn copy_texture(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> wgpu::Texture {
        let texture = self
            .texture_pool
            .acquire(context, width, height, "compositor-copy-texture");
        self.blit_texture(context, encoder, source, &texture);
        texture
    }

    fn render_source_to_texture(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::Texture,
        target: &wgpu::Texture,
        width: u32,
        height: u32,
        layer: &LayerDescriptor,
    ) {
        let source_view = source.create_view(&wgpu::TextureViewDescriptor::default());
        let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
        let source_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-layer-source-bind-group"),
                layout: context.texture_sampler_bind_group_layout(),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&source_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                    },
                ],
            });
        let layer_uniforms = LayerUniformBuffer {
            resolution: [width as f32, height as f32],
            center: [layer.transform.center_x, layer.transform.center_y],
            size: [layer.transform.width, layer.transform.height],
            rotation_radians: layer.transform.rotation_degrees.to_radians(),
            opacity: layer.opacity,
            flip_x: if layer.transform.flip_x { 1.0 } else { 0.0 },
            flip_y: if layer.transform.flip_y { 1.0 } else { 0.0 },
            _padding: [0.0; 2],
        };
        let projection_uniforms = layer.projection.map(|p| ProjectionUniformBuffer {
            angles: [
                p.yaw.to_radians(),
                p.pitch.to_radians(),
                p.roll.to_radians(),
                p.fov.to_radians(),
            ],
            resolution: [width as f32, height as f32],
            lens: p.lens,
            mode: if p.place {
                2.0
            } else if p.equirectangular {
                1.0
            } else {
                0.0
            },
            opacity: layer.opacity,
            // Source aspect, for laying a flat layer on the sphere.
            _padding: [
                source.width() as f32 / source.height().max(1) as f32,
                p.plane_half_width,
                0.0,
            ],
        });
        let contents: &[u8] = match &projection_uniforms {
            Some(uniforms) => bytemuck::bytes_of(uniforms),
            None => bytemuck::bytes_of(&layer_uniforms),
        };
        let uniform_buffer =
            context
                .device()
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("compositor-layer-uniform-buffer"),
                    contents,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                });
        let uniform_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-layer-uniform-bind-group"),
                layout: &self.layer_uniform_bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }],
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("compositor-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &target_view,
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
            render_pass.set_pipeline(if projection_uniforms.is_some() {
                &self.projection_pipeline
            } else {
                &self.layer_pipeline
            });
            render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
            render_pass.set_bind_group(0, &source_bind_group, &[]);
            render_pass.set_bind_group(1, &uniform_bind_group, &[]);
            render_pass.draw(0..6, 0..1);
        }
    }

    fn apply_mask(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        layer_texture: &wgpu::Texture,
        mask_texture: &wgpu::Texture,
        inverted: bool,
        width: u32,
        height: u32,
    ) -> wgpu::Texture {
        let target = self
            .texture_pool
            .acquire(context, width, height, "compositor-masked-texture");
        let layer_view = layer_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mask_view = mask_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());

        let layer_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-mask-layer-bind-group"),
                layout: context.texture_sampler_bind_group_layout(),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&layer_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                    },
                ],
            });
        let mask_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-mask-mask-bind-group"),
                layout: context.texture_sampler_bind_group_layout(),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&mask_view),
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
                    label: Some("compositor-mask-uniform-buffer"),
                    contents: bytemuck::bytes_of(&MaskUniformBuffer {
                        inverted: if inverted { 1.0 } else { 0.0 },
                        _padding: [0.0; 3],
                    }),
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                });
        let uniform_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-mask-uniform-bind-group"),
                layout: &self.mask_uniform_bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }],
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("compositor-mask-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &target_view,
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
            render_pass.set_pipeline(&self.mask_pipeline);
            render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
            render_pass.set_bind_group(0, &layer_bind_group, &[]);
            render_pass.set_bind_group(1, &mask_bind_group, &[]);
            render_pass.set_bind_group(2, &uniform_bind_group, &[]);
            render_pass.draw(0..6, 0..1);
        }
        target
    }

    fn blend_texture(
        &mut self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        base: &wgpu::Texture,
        layer: &wgpu::Texture,
        blend_mode: BlendMode,
        width: u32,
        height: u32,
    ) -> Result<wgpu::Texture, CompositorError> {
        let target =
            self.texture_pool
                .acquire(context, width, height, "compositor-blended-texture");
        let base_view = base.create_view(&wgpu::TextureViewDescriptor::default());
        let layer_view = layer.create_view(&wgpu::TextureViewDescriptor::default());
        let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
        let base_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-base-bind-group"),
                layout: context.texture_sampler_bind_group_layout(),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&base_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                    },
                ],
            });
        let layer_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-layer-bind-group"),
                layout: context.texture_sampler_bind_group_layout(),
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&layer_view),
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
                    label: Some("compositor-blend-uniform-buffer"),
                    contents: bytemuck::bytes_of(&BlendUniformBuffer {
                        blend_mode: blend_mode.shader_code(),
                        _padding: [0; 3],
                    }),
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                });
        let uniform_bind_group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("compositor-blend-uniform-bind-group"),
                layout: &self.blend_uniform_bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }],
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("compositor-blend-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &target_view,
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
            render_pass.set_pipeline(&self.blend_pipeline);
            render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
            render_pass.set_bind_group(0, &base_bind_group, &[]);
            render_pass.set_bind_group(1, &layer_bind_group, &[]);
            render_pass.set_bind_group(2, &uniform_bind_group, &[]);
            render_pass.draw(0..6, 0..1);
        }
        Ok(target)
    }

    fn blit_texture(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::Texture,
        target: &wgpu::Texture,
    ) {
        let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
        context.encode_texture_blit_to_view(
            encoder,
            source,
            &target_view,
            target.format(),
            "compositor-blit-pass",
        );
    }
}

fn map_effect_passes(passes: &[EffectPassDescriptor]) -> Vec<EffectPass> {
    passes
        .iter()
        .map(|pass| EffectPass {
            shader: pass.shader.clone(),
            wrap: pass.wrap,
            uniforms: pass
                .uniforms
                .iter()
                .map(|(name, value)| {
                    let uniform_value = match value {
                        EffectUniformValueDescriptor::Number(n) => UniformValue::Number(*n),
                        EffectUniformValueDescriptor::Vector(v) => UniformValue::Vector(v.clone()),
                    };
                    (name.clone(), uniform_value)
                })
                .collect(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compositor_shaders_are_valid_wgsl() {
        for (id, source) in [
            ("layer", LAYER_SHADER_SOURCE),
            ("projection", PROJECTION_SHADER_SOURCE),
        ] {
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
    fn projection_uniforms_match_wgsl_layout() {
        assert_eq!(std::mem::size_of::<ProjectionUniformBuffer>(), 48);
    }
}
