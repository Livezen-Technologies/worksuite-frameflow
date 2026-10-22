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

// p0.x amount 0–1, p0.y 1 = white lines on black, 0 = dark lines on white
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let t = vec2f(1.0) / u.resolution;
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    var gx = 0.0;
    var gy = 0.0;
    let kx = array<f32, 9>(-1.0, 0.0, 1.0, -2.0, 0.0, 2.0, -1.0, 0.0, 1.0);
    let ky = array<f32, 9>(-1.0, -2.0, -1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 1.0);
    for (var i = 0; i < 9; i = i + 1) {
        let o = vec2f(f32(i % 3 - 1), f32(i / 3 - 1)) * t;
        let l = dot(straight(textureSample(input_texture, input_sampler, input.tex_coord + o)), LUMA);
        gx = gx + l * kx[i];
        gy = gy + l * ky[i];
    }
    let e = clamp(length(vec2f(gx, gy)), 0.0, 1.0);
    let lines = select(vec3f(1.0 - e), vec3f(e), u.p0.y > 0.5);
    let rgb = mix(straight(c), lines, u.p0.x);
    return vec4f(rgb * c.a, c.a);
}
