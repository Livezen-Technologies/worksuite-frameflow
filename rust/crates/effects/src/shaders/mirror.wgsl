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

// p0.x mode: 0 left→right, 1 right→left, 2 top→bottom, 3 bottom→top, 4 four-way
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    var uv = input.tex_coord;
    let mode = i32(round(u.p0.x));
    if (mode == 0 && uv.x > 0.5) { uv.x = 1.0 - uv.x; }
    if (mode == 1 && uv.x < 0.5) { uv.x = 1.0 - uv.x; }
    if (mode == 2 && uv.y > 0.5) { uv.y = 1.0 - uv.y; }
    if (mode == 3 && uv.y < 0.5) { uv.y = 1.0 - uv.y; }
    if (mode == 4) { uv = vec2f(0.5) - abs(uv - vec2f(0.5)); }
    return textureSample(input_texture, input_sampler, uv);
}
