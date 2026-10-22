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

// p0.x amount 0–1, p0.y scanline strength 0–1, p0.z colour bleed 0–1, p0.w noise 0–1
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let uv = input.tex_coord;
    let line = floor(uv.y * u.resolution.y);
    // Slight per-line horizontal jitter that changes every few frames.
    let jitter = (hash(vec2f(line, floor(u.time * 12.0))) - 0.5) * 0.004 * u.p0.x;
    let bleed = 0.006 * u.p0.z;
    let r = textureSample(input_texture, input_sampler, uv + vec2f(jitter + bleed, 0.0));
    let g = textureSample(input_texture, input_sampler, uv + vec2f(jitter, 0.0));
    let b = textureSample(input_texture, input_sampler, uv + vec2f(jitter - bleed, 0.0));
    var rgb = vec3f(r.r, g.g, b.b);
    let scan = 1.0 - u.p0.y * 0.35 * (0.5 + 0.5 * sin(uv.y * u.resolution.y * 3.14159));
    rgb = rgb * scan;
    rgb = rgb + (hash(uv * u.resolution + vec2f(u.time * 60.0)) - 0.5) * 0.15 * u.p0.w;
    rgb = mix(vec3f(dot(rgb, LUMA)), rgb, 1.0 + 0.3 * u.p0.x);
    return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), g.a);
}
