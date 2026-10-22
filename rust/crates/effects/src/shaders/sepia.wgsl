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

// p0.x amount 0–1
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let s = straight(c);
    let tone = vec3f(dot(s, vec3f(0.393, 0.769, 0.189)), dot(s, vec3f(0.349, 0.686, 0.168)), dot(s, vec3f(0.272, 0.534, 0.131)));
    let rgb = clamp(mix(s, tone, u.p0.x), vec3f(0.0), vec3f(1.0));
    return vec4f(rgb * c.a, c.a);
}
