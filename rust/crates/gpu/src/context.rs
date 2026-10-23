use wgpu::util::DeviceExt;

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
use std::cell::RefCell;

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
use wasm_bindgen::JsCast;

use crate::{FULLSCREEN_SHADER_SOURCE, GpuError};

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
#[derive(Debug)]
struct WebDisplay;

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
impl wgpu::rwh::HasDisplayHandle for WebDisplay {
    fn display_handle(&self) -> Result<wgpu::rwh::DisplayHandle<'_>, wgpu::rwh::HandleError> {
        let raw = wgpu::rwh::WebDisplayHandle::new();
        Ok(unsafe { wgpu::rwh::DisplayHandle::borrow_raw(raw.into()) })
    }
}

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
struct CachedCanvasSurface {
    surface: wgpu::Surface<'static>,
    size: (u32, u32),
}

const BLIT_SHADER_SOURCE: &str = include_str!("shaders/blit.wgsl");

const FULLSCREEN_QUAD_POSITIONS: [[f32; 2]; 6] = [
    [-1.0, -1.0],
    [1.0, -1.0],
    [-1.0, 1.0],
    [-1.0, 1.0],
    [1.0, -1.0],
    [1.0, 1.0],
];

pub struct GpuContext {
    instance: wgpu::Instance,
    adapter: wgpu::Adapter,
    device: wgpu::Device,
    queue: wgpu::Queue,
    /// Working format for everything drawn inside the engine: 16-bit float when
    /// the GPU can render, blend and filter it (WS-14), so grades stacked on
    /// grades don't band. Frames leave through `surface_format`.
    texture_format: wgpu::TextureFormat,
    /// 8-bit format of the canvases frames are shown and exported through.
    surface_format: wgpu::TextureFormat,
    fullscreen_quad: wgpu::Buffer,
    linear_sampler: wgpu::Sampler,
    wrap_sampler: wgpu::Sampler,
    nearest_sampler: wgpu::Sampler,
    texture_sampler_bind_group_layout: wgpu::BindGroupLayout,
    blit_pipeline: wgpu::RenderPipeline,
    working_blit_pipeline: wgpu::RenderPipeline,
    supports_external_texture_copies: bool,
    /// The HTML canvas that the WebGL context is bound to. Only populated on the WebGL
    /// fallback path. Used by render_texture_via_gl_canvas to output frames on WebGL.
    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    gl_canvas: Option<web_sys::HtmlCanvasElement>,
    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    gl_surface: RefCell<Option<CachedCanvasSurface>>,
}

impl GpuContext {
    pub async fn new() -> Result<Self, GpuError> {
        #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
        let (instance, adapter, device, queue, gl_canvas) = Self::acquire_device().await?;
        #[cfg(not(all(feature = "wasm", target_arch = "wasm32")))]
        let (instance, adapter, device, queue) = Self::acquire_device().await?;
        let surface_format = if adapter.get_info().backend == wgpu::Backend::Gl {
            wgpu::TextureFormat::Rgba8Unorm
        } else {
            wgpu::TextureFormat::Bgra8Unorm
        };
        let texture_format = if supports_float_rendering(&adapter) {
            wgpu::TextureFormat::Rgba16Float
        } else {
            surface_format
        };
        let fullscreen_quad = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("gpu-fullscreen-quad-buffer"),
            contents: bytemuck::cast_slice(&FULLSCREEN_QUAD_POSITIONS),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let linear_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("gpu-linear-sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let wrap_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("gpu-wrap-sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let nearest_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("gpu-nearest-sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let texture_sampler_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("gpu-texture-sampler-bind-group-layout"),
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
        let vertex_shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("gpu-fullscreen-shader"),
            source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
        });
        let blit_shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("gpu-blit-shader"),
            source: wgpu::ShaderSource::Wgsl(BLIT_SHADER_SOURCE.into()),
        });
        let blit_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("gpu-blit-pipeline-layout"),
            bind_group_layouts: &[Some(&texture_sampler_bind_group_layout)],
            immediate_size: 0,
        });
        let make_blit = |format: wgpu::TextureFormat| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("gpu-blit-pipeline"),
                layout: Some(&blit_pipeline_layout),
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
                    module: &blit_shader_module,
                    entry_point: Some("fragment_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
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
        // To canvases (8-bit), and between the engine's own textures (WS-14).
        let blit_pipeline = make_blit(surface_format);
        let working_blit_pipeline = make_blit(texture_format);

        let supports_external_texture_copies = adapter
            .get_downlevel_capabilities()
            .flags
            .contains(wgpu::DownlevelFlags::UNRESTRICTED_EXTERNAL_TEXTURE_COPIES);

        Ok(Self {
            instance,
            adapter,
            device,
            queue,
            texture_format,
            surface_format,
            fullscreen_quad,
            linear_sampler,
            wrap_sampler,
            nearest_sampler,
            texture_sampler_bind_group_layout,
            blit_pipeline,
            working_blit_pipeline,
            supports_external_texture_copies,
            #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
            gl_canvas,
            #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
            gl_surface: RefCell::new(None),
        })
    }

    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    async fn acquire_device() -> Result<
        (
            wgpu::Instance,
            wgpu::Adapter,
            wgpu::Device,
            wgpu::Queue,
            Option<web_sys::HtmlCanvasElement>,
        ),
        GpuError,
    > {
        let instance = wgpu::util::new_instance_with_webgpu_detection(
            wgpu::InstanceDescriptor::new_without_display_handle(),
        )
        .await;

        match Self::try_request_device(&instance, None).await {
            Ok((adapter, device, queue)) => return Ok((instance, adapter, device, queue, None)),
            Err(_) => {}
        }
        let (gl_instance, adapter, device, queue, canvas) = Self::try_gl_fallback().await?;
        Ok((gl_instance, adapter, device, queue, Some(canvas)))
    }

    #[cfg(not(all(feature = "wasm", target_arch = "wasm32")))]
    async fn acquire_device()
    -> Result<(wgpu::Instance, wgpu::Adapter, wgpu::Device, wgpu::Queue), GpuError> {
        let instance = wgpu::util::new_instance_with_webgpu_detection(
            wgpu::InstanceDescriptor::new_without_display_handle(),
        )
        .await;

        match Self::try_request_device(&instance, None).await {
            Ok((adapter, device, queue)) => return Ok((instance, adapter, device, queue)),
            Err(_) => {}
        }

        Self::try_gl_fallback().await
    }

    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    async fn try_gl_fallback() -> Result<
        (
            wgpu::Instance,
            wgpu::Adapter,
            wgpu::Device,
            wgpu::Queue,
            web_sys::HtmlCanvasElement,
        ),
        GpuError,
    > {
        let mut gl_desc = wgpu::InstanceDescriptor::new_without_display_handle();
        gl_desc.backends = wgpu::Backends::GL;
        gl_desc.display = Some(Box::new(WebDisplay));
        let gl_instance = wgpu::Instance::new(gl_desc);

        let document = web_sys::window()
            .and_then(|w| w.document())
            .ok_or(GpuError::AdapterUnavailable)?;
        let canvas: web_sys::HtmlCanvasElement = document
            .create_element("canvas")
            .map_err(|_| GpuError::AdapterUnavailable)?
            .unchecked_into();
        canvas.set_width(1);
        canvas.set_height(1);
        let surface = gl_instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))?;

        let (adapter, device, queue) =
            Self::try_request_device(&gl_instance, Some(&surface)).await?;
        Ok((gl_instance, adapter, device, queue, canvas))
    }

    #[cfg(not(all(feature = "wasm", target_arch = "wasm32")))]
    async fn try_gl_fallback()
    -> Result<(wgpu::Instance, wgpu::Adapter, wgpu::Device, wgpu::Queue), GpuError> {
        Err(GpuError::AdapterUnavailable)
    }

    async fn try_request_device(
        instance: &wgpu::Instance,
        compatible_surface: Option<&wgpu::Surface<'_>>,
    ) -> Result<(wgpu::Adapter, wgpu::Device, wgpu::Queue), GpuError> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface,
                force_fallback_adapter: false,
            })
            .await
            .map_err(|_| GpuError::AdapterUnavailable)?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("gpu-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_webgl2_defaults()
                    .using_resolution(adapter.limits()),
                memory_hints: wgpu::MemoryHints::Performance,
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
                trace: wgpu::Trace::Off,
            })
            .await?;

        Ok((adapter, device, queue))
    }

    pub fn create_render_texture(
        &self,
        width: u32,
        height: u32,
        label: &'static str,
    ) -> wgpu::Texture {
        self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: self.texture_format,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
    }

    /// A render texture filled from half-float RGBA bits (HD-14), top row
    /// first; on 8-bit engines the values are rounded to 8 bits.
    pub fn create_texture_from_rgba16f(
        &self,
        width: u32,
        height: u32,
        half: &[u16],
        label: &'static str,
    ) -> wgpu::Texture {
        let texture = self.create_render_texture(width, height, label);
        let float = self.texture_format == wgpu::TextureFormat::Rgba16Float;
        let bytes: Vec<u8> = if float {
            half.iter().flat_map(|h| h.to_le_bytes()).collect()
        } else {
            let to8 = |h: u16| (f16_bits_to_f32(h).clamp(0.0, 1.0) * 255.0).round() as u8;
            let bgra = self.texture_format == wgpu::TextureFormat::Bgra8Unorm;
            half.chunks_exact(4)
                .flat_map(|p| {
                    let [r, g, b, a] = [to8(p[0]), to8(p[1]), to8(p[2]), to8(p[3])];
                    if bgra { [b, g, r, a] } else { [r, g, b, a] }
                })
                .collect()
        };
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &bytes,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * if float { 8 } else { 4 }),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        texture
    }

    pub fn instance(&self) -> &wgpu::Instance {
        &self.instance
    }

    pub fn adapter(&self) -> &wgpu::Adapter {
        &self.adapter
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    pub fn texture_format(&self) -> wgpu::TextureFormat {
        self.texture_format
    }

    pub fn surface_format(&self) -> wgpu::TextureFormat {
        self.surface_format
    }

    /// Whether the engine composites in 16-bit float (WS-14).
    pub fn high_precision(&self) -> bool {
        self.texture_format == wgpu::TextureFormat::Rgba16Float
    }

    pub fn fullscreen_quad(&self) -> &wgpu::Buffer {
        &self.fullscreen_quad
    }

    /// Wraps left/right, clamps top/bottom: for equirectangular 360° frames (VR-18).
    pub fn wrap_sampler(&self) -> &wgpu::Sampler {
        &self.wrap_sampler
    }

    pub fn linear_sampler(&self) -> &wgpu::Sampler {
        &self.linear_sampler
    }

    pub fn nearest_sampler(&self) -> &wgpu::Sampler {
        &self.nearest_sampler
    }

    pub fn texture_sampler_bind_group_layout(&self) -> &wgpu::BindGroupLayout {
        &self.texture_sampler_bind_group_layout
    }

    pub fn blit_pipeline(&self) -> &wgpu::RenderPipeline {
        &self.blit_pipeline
    }

    /// Whether the GPU backend can render to arbitrary canvas surfaces.
    /// True for WebGPU, false for WebGL which can only surface-render to
    /// the specific canvas its GL context was originally created on.
    pub fn supports_surface_rendering(&self) -> bool {
        self.supports_external_texture_copies
    }

    /// The HTML canvas that owns the backing WebGL context, if running on the
    /// WebGL fallback. Callers on that path can mount this canvas directly
    /// instead of copying pixels out of it every frame.
    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    pub fn gl_canvas(&self) -> Option<&web_sys::HtmlCanvasElement> {
        self.gl_canvas.as_ref()
    }

    /// Forgets the size the shared WebGL canvas surface was last configured
    /// for, so the next effect render reconfigures it. Needed because the
    /// compositor reconfigures the same canvas for its own (larger) frames.
    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    pub fn invalidate_gl_surface_size(&self) {
        if let Some(cached) = self.gl_surface.borrow_mut().as_mut() {
            cached.size = (0, 0);
        }
    }

    pub fn render_texture_to_surface(
        &self,
        texture: &wgpu::Texture,
        surface: &wgpu::Surface<'_>,
        width: u32,
        height: u32,
    ) -> Result<(), GpuError> {
        self.configure_surface(surface, width, height)?;
        self.present_texture_to_surface(texture, surface)
    }

    pub fn present_texture_to_surface(
        &self,
        texture: &wgpu::Texture,
        surface: &wgpu::Surface<'_>,
    ) -> Result<(), GpuError> {
        let surface_texture = self.acquire_surface_texture(surface)?;
        let target_view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("gpu-surface-blit-encoder"),
            });
        self.encode_texture_blit_to_view(
            &mut encoder,
            texture,
            &target_view,
            self.surface_format,
            "gpu-surface-blit",
        );
        self.queue.submit([encoder.finish()]);
        surface_texture.present();
        Ok(())
    }

    pub fn configure_surface(
        &self,
        surface: &wgpu::Surface<'_>,
        width: u32,
        height: u32,
    ) -> Result<(), GpuError> {
        let config = self.build_surface_configuration(surface, width, height)?;
        surface.configure(&self.device, &config);
        Ok(())
    }

    fn build_surface_configuration(
        &self,
        surface: &wgpu::Surface<'_>,
        width: u32,
        height: u32,
    ) -> Result<wgpu::SurfaceConfiguration, GpuError> {
        let caps = surface.get_capabilities(&self.adapter);
        if !caps.formats.contains(&self.surface_format) {
            return Err(GpuError::UnsupportedSurfaceFormat);
        }

        Ok(wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: self.surface_format,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: caps
                .alpha_modes
                .first()
                .copied()
                .unwrap_or(wgpu::CompositeAlphaMode::Auto),
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        })
    }

    pub fn acquire_surface_texture(
        &self,
        surface: &wgpu::Surface<'_>,
    ) -> Result<wgpu::SurfaceTexture, GpuError> {
        match surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(surface_texture)
            | wgpu::CurrentSurfaceTexture::Suboptimal(surface_texture) => Ok(surface_texture),
            wgpu::CurrentSurfaceTexture::Timeout
            | wgpu::CurrentSurfaceTexture::Occluded
            | wgpu::CurrentSurfaceTexture::Outdated
            | wgpu::CurrentSurfaceTexture::Lost
            | wgpu::CurrentSurfaceTexture::Validation => Err(GpuError::UnsupportedSurfaceFormat),
        }
    }

    pub fn encode_texture_blit_to_view(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        texture: &wgpu::Texture,
        target_view: &wgpu::TextureView,
        target_format: wgpu::TextureFormat,
        label: &'static str,
    ) {
        let source_view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("gpu-blit-bind-group"),
            layout: &self.texture_sampler_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&source_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.linear_sampler),
                },
            ],
        });

        let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some(label),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target_view,
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
        render_pass.set_pipeline(if target_format == self.surface_format {
            &self.blit_pipeline
        } else {
            &self.working_blit_pipeline
        });
        render_pass.set_vertex_buffer(0, self.fullscreen_quad.slice(..));
        render_pass.set_bind_group(0, &bind_group, &[]);
        render_pass.draw(0..6, 0..1);
    }

    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    pub fn import_offscreen_canvas_texture(
        &self,
        canvas: &wgpu::web_sys::OffscreenCanvas,
        width: u32,
        height: u32,
        label: &'static str,
    ) -> wgpu::Texture {
        let texture = self.create_render_texture(width, height, label);

        if self.supports_external_texture_copies {
            self.queue.copy_external_image_to_texture(
                &wgpu::CopyExternalImageSourceInfo {
                    source: wgpu::ExternalImageSource::OffscreenCanvas(canvas.clone()),
                    origin: wgpu::Origin2d::ZERO,
                    flip_y: false,
                },
                wgpu::CopyExternalImageDestInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                    color_space: wgpu::PredefinedColorSpace::Srgb,
                    premultiplied_alpha: false,
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
        } else {
            let ctx: web_sys::OffscreenCanvasRenderingContext2d = canvas
                .get_context("2d")
                .ok()
                .flatten()
                .expect("Failed to get 2d context for texture import")
                .unchecked_into();
            let image_data = ctx
                .get_image_data(0.0, 0.0, width as f64, height as f64)
                .expect("Failed to read pixel data from canvas");
            let rgba_bytes = image_data.data();

            let float = self.texture_format == wgpu::TextureFormat::Rgba16Float;
            let pixel_bytes = if float {
                rgba8_to_rgba16f(&rgba_bytes)
            } else if self.texture_format == wgpu::TextureFormat::Bgra8Unorm {
                let mut bytes = rgba_bytes.to_vec();
                for pixel in bytes.chunks_exact_mut(4) {
                    pixel.swap(0, 2);
                }
                bytes
            } else {
                rgba_bytes.to_vec()
            };

            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &pixel_bytes,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(width * if float { 8 } else { 4 }),
                    rows_per_image: Some(height),
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
        }

        texture
    }

    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    pub fn render_texture_to_offscreen_canvas(
        &self,
        texture: &wgpu::Texture,
        canvas: &wgpu::web_sys::OffscreenCanvas,
        width: u32,
        height: u32,
    ) -> Result<(), GpuError> {
        if self.supports_external_texture_copies {
            let surface = self
                .instance
                .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas.clone()))?;
            return self.render_texture_to_surface(texture, &surface, width, height);
        }

        self.render_texture_to_offscreen_canvas_via_gl_canvas(texture, canvas, width, height)
    }

    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    fn render_texture_to_offscreen_canvas_via_gl_canvas(
        &self,
        texture: &wgpu::Texture,
        canvas: &wgpu::web_sys::OffscreenCanvas,
        width: u32,
        height: u32,
    ) -> Result<(), GpuError> {
        let gl_canvas = self.render_texture_to_gl_canvas_surface(texture, width, height)?;

        let ctx: web_sys::OffscreenCanvasRenderingContext2d = canvas
            .get_context("2d")
            .ok()
            .flatten()
            .ok_or(GpuError::AdapterUnavailable)?
            .unchecked_into();
        ctx.clear_rect(0.0, 0.0, width as f64, height as f64);
        ctx.draw_image_with_html_canvas_element(gl_canvas, 0.0, 0.0)
            .map_err(|_| GpuError::AdapterUnavailable)?;

        Ok(())
    }

    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    pub fn render_texture_to_gl_canvas_surface(
        &self,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<&web_sys::HtmlCanvasElement, GpuError> {
        let gl_canvas = self
            .gl_canvas
            .as_ref()
            .ok_or(GpuError::AdapterUnavailable)?;

        gl_canvas.set_width(width);
        gl_canvas.set_height(height);

        let mut cached_surface = self.gl_surface.borrow_mut();
        let cached_surface = match cached_surface.as_mut() {
            Some(cached_surface) => cached_surface,
            None => {
                let surface = self
                    .instance
                    .create_surface(wgpu::SurfaceTarget::Canvas(gl_canvas.clone()))?;
                cached_surface.replace(CachedCanvasSurface {
                    surface,
                    size: (0, 0),
                });
                cached_surface
                    .as_mut()
                    .expect("gl_surface cache should exist after initialization")
            }
        };

        if cached_surface.size != (width, height) {
            self.configure_surface(&cached_surface.surface, width, height)?;
            cached_surface.size = (width, height);
        }

        self.present_texture_to_surface(texture, &cached_surface.surface)?;

        Ok(gl_canvas)
    }

    /// Renders a texture to an arbitrary HTML canvas on the WebGL backend.
    ///
    /// WebGL can only surface-render to the canvas its GL context was originally created on.
    /// This method renders the texture to the GL canvas, then uses drawImage to copy the
    /// result to the target canvas — avoiding the async buffer readback issue entirely.
    ///
    /// The HTML canvas default color space is sRGB, so the surface may report
    /// `Rgba8UnormSrgb` as its preferred format even though our render textures use
    /// `Rgba8Unorm`. We explicitly select `Rgba8Unorm` from the surface's supported
    /// format list (WebGL2 supports both) to avoid the format mismatch.
    #[cfg(all(feature = "wasm", target_arch = "wasm32"))]
    pub fn render_texture_via_gl_canvas(
        &self,
        texture: &wgpu::Texture,
        target_canvas: &web_sys::HtmlCanvasElement,
        width: u32,
        height: u32,
    ) -> Result<(), GpuError> {
        let gl_canvas = self.render_texture_to_gl_canvas_surface(texture, width, height)?;

        let ctx: web_sys::CanvasRenderingContext2d = target_canvas
            .get_context("2d")
            .ok()
            .flatten()
            .ok_or(GpuError::AdapterUnavailable)?
            .unchecked_into();
        ctx.draw_image_with_html_canvas_element(gl_canvas, 0.0, 0.0)
            .map_err(|_| GpuError::AdapterUnavailable)?;

        Ok(())
    }
}

/// The GPU can draw into, blend and filter 16-bit float textures.
fn supports_float_rendering(adapter: &wgpu::Adapter) -> bool {
    let features = adapter.get_texture_format_features(wgpu::TextureFormat::Rgba16Float);
    features
        .allowed_usages
        .contains(wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING)
        && features.flags.contains(
            wgpu::TextureFormatFeatureFlags::FILTERABLE
                | wgpu::TextureFormatFeatureFlags::BLENDABLE,
        )
}

/// 8-bit RGBA to 16-bit float RGBA bytes, for the CPU upload fallback.
pub fn rgba8_to_rgba16f(rgba: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(rgba.len() * 2);
    for &v in rgba {
        out.extend_from_slice(&f32_to_f16_bits(v as f32 / 255.0).to_le_bytes());
    }
    out
}

/// IEEE half-precision bits for a value in 0..=1 (exact for 8-bit inputs to 1/2048).
pub fn f32_to_f16_bits(value: f32) -> u16 {
    let bits = value.to_bits();
    let sign = ((bits >> 16) & 0x8000) as u16;
    let exponent = ((bits >> 23) & 0xff) as i32 - 127 + 15;
    let mantissa = bits & 0x7f_ffff;
    if value == 0.0 {
        return sign;
    }
    if exponent <= 0 {
        // Subnormal half.
        let m = (mantissa | 0x80_0000) >> (1 - exponent + 13);
        return sign | m as u16;
    }
    if exponent >= 31 {
        return sign | 0x7c00;
    }
    // Round to nearest.
    let rounded = mantissa + 0x1000;
    if rounded & 0x80_0000 != 0 {
        return sign | (((exponent + 1) as u16) << 10);
    }
    sign | ((exponent as u16) << 10) | (rounded >> 13) as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_floats() {
        assert_eq!(f32_to_f16_bits(0.0), 0x0000);
        assert_eq!(f32_to_f16_bits(1.0), 0x3c00);
        assert_eq!(f32_to_f16_bits(0.5), 0x3800);
        // Every 8-bit level survives the round trip.
        for v in 0..=255u32 {
            let h = f32_to_f16_bits(v as f32 / 255.0);
            let e = ((h >> 10) & 0x1f) as i32;
            let m = (h & 0x3ff) as f32;
            let back = if e == 0 {
                m / 1024.0 * 2f32.powi(-14)
            } else {
                (1.0 + m / 1024.0) * 2f32.powi(e - 15)
            };
            assert_eq!((back * 255.0).round() as u32, v);
        }
    }
}

/// Half-precision bits to f32.
pub fn f16_bits_to_f32(h: u16) -> f32 {
    let sign = if h & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exponent = ((h >> 10) & 0x1f) as i32;
    let mantissa = (h & 0x3ff) as f32;
    sign * match exponent {
        0 => mantissa / 1024.0 * 2f32.powi(-14),
        31 => f32::INFINITY,
        e => (1.0 + mantissa / 1024.0) * 2f32.powi(e - 15),
    }
}

/// Bytes read back from a render texture (rows padded to `padded_row`) as
/// 16-bit RGBA, 0–65535, in the order FFmpeg's `rgba64le` expects.
pub fn texels_to_rgba16(
    bytes: &[u8],
    format: wgpu::TextureFormat,
    width: u32,
    height: u32,
    padded_row: u32,
) -> Vec<u16> {
    let mut out = Vec::with_capacity((width * height * 4) as usize);
    let to16 = |v: f32| (v.clamp(0.0, 1.0) * 65535.0).round() as u16;
    for y in 0..height {
        let row = &bytes[(y * padded_row) as usize..];
        for x in 0..width as usize {
            match format {
                wgpu::TextureFormat::Rgba16Float => {
                    for c in 0..4 {
                        let i = x * 8 + c * 2;
                        out.push(to16(f16_bits_to_f32(u16::from_le_bytes([row[i], row[i + 1]]))));
                    }
                }
                wgpu::TextureFormat::Bgra8Unorm => {
                    let p = &row[x * 4..x * 4 + 4];
                    for v in [p[2], p[1], p[0], p[3]] {
                        out.push(v as u16 * 257);
                    }
                }
                _ => {
                    for &v in &row[x * 4..x * 4 + 4] {
                        out.push(v as u16 * 257);
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod readback_tests {
    use super::*;

    #[test]
    fn float_and_8bit_texels_to_16bit() {
        let half = |v: f32| f32_to_f16_bits(v).to_le_bytes();
        let mut row = Vec::new();
        for v in [0.0, 0.25, 1.0, 1.0] {
            row.extend_from_slice(&half(v));
        }
        row.resize(16, 0); // padding
        assert_eq!(
            texels_to_rgba16(&row, wgpu::TextureFormat::Rgba16Float, 1, 1, 16),
            vec![0, 16384, 65535, 65535]
        );
        assert_eq!(
            texels_to_rgba16(&[10, 20, 30, 255], wgpu::TextureFormat::Bgra8Unorm, 1, 1, 4),
            vec![30 * 257, 20 * 257, 10 * 257, 65535]
        );
        assert!((f16_bits_to_f32(f32_to_f16_bits(0.3)) - 0.3).abs() < 1e-3);
    }
}
