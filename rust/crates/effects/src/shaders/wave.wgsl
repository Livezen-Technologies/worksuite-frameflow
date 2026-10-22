struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

// Shared by the single-pass "stylise" effects: p0/p1 are the effect's own
// parameters, documented per shader.
struct StyliseUniforms {
    resolution: vec2f,
    time: f32,
    _pad: f32,
    p0: vec4f,
    p1: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> u: StyliseUniforms;

const LUMA = vec3f(0.2126, 0.7152, 0.0722);

fn straight(c: vec4f) -> vec3f {
    if (c.a <= 0.0) { return vec3f(0.0); }
    return c.rgb / c.a;
}

fn hash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// p0.x amplitude 0–1 (2 % of the frame), p0.y frequency 1–30, p0.z speed 0–5, p0.w direction 0 horizontal / 1 vertical
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    var uv = input.tex_coord;
    let phase = u.time * u.p0.z * 6.28318;
    if (u.p0.w < 0.5) {
        uv.x = uv.x + sin(uv.y * u.p0.y * 6.28318 + phase) * u.p0.x * 0.02;
    } else {
        uv.y = uv.y + sin(uv.x * u.p0.y * 6.28318 + phase) * u.p0.x * 0.02;
    }
    return textureSample(input_texture, input_sampler, uv);
}
