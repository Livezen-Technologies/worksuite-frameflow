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

// p0.x amount 0–1, p0.y size 0–1 (radius of the clear centre), p0.z softness 0–1
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let aspect = u.resolution.x / max(u.resolution.y, 1.0);
    let d = length((input.tex_coord - vec2f(0.5)) * vec2f(aspect, 1.0)) / length(vec2f(aspect, 1.0) * 0.5);
    let inner = mix(0.2, 0.9, u.p0.y);
    let edge = smoothstep(inner, inner + max(u.p0.z, 0.02), d);
    let darken = 1.0 - u.p0.x * edge;
    return vec4f(c.rgb * darken, c.a);
}
