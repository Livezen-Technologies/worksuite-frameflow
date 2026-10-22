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

// p0.x amount 0–1 (fraction of 2 % of the width), p0.y angle degrees
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let angle = radians(u.p0.y);
    let offset = vec2f(cos(angle), sin(angle)) * u.p0.x * 0.02 * vec2f(1.0, u.resolution.x / max(u.resolution.y, 1.0));
    let r = textureSample(input_texture, input_sampler, input.tex_coord + offset);
    let g = textureSample(input_texture, input_sampler, input.tex_coord);
    let b = textureSample(input_texture, input_sampler, input.tex_coord - offset);
    return vec4f(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
}
