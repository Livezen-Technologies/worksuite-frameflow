// 3D LUT (.cube) applied with trilinear interpolation. The LUT is stored as a
// 2D texture of N slices side by side: x = r + b * N, y = g. Red/green are
// filtered by the sampler inside a slice; blue is blended between two slices.
// Input is premultiplied; the LUT runs on straight colour.

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct LutUniforms {
    size: f32,
    intensity: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: LutUniforms;
@group(2) @binding(0) var lut_texture: texture_2d<f32>;
@group(2) @binding(1) var lut_sampler: sampler;

fn sample_slice(rg: vec2f, slice: f32) -> vec3f {
    let n = uniforms.size;
    let u = (slice * n + rg.x * (n - 1.0) + 0.5) / (n * n);
    let v = (rg.y * (n - 1.0) + 0.5) / n;
    return textureSampleLevel(lut_texture, lut_sampler, vec2f(u, v), 0.0).rgb;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let color = textureSample(input_texture, input_sampler, input.tex_coord);
    if (color.a <= 0.0) {
        return color;
    }
    let straight = clamp(color.rgb / color.a, vec3f(0.0), vec3f(1.0));
    let n = uniforms.size;
    let blue = straight.b * (n - 1.0);
    let slice0 = floor(blue);
    let slice1 = min(slice0 + 1.0, n - 1.0);
    let mapped = mix(
        sample_slice(straight.rg, slice0),
        sample_slice(straight.rg, slice1),
        blue - slice0,
    );
    let graded = mix(straight, mapped, clamp(uniforms.intensity, 0.0, 1.0));
    return vec4f(graded * color.a, color.a);
}
