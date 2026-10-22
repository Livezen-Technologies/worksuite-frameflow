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

// p0.x radius px 1–40, p0.y intensity 0–2, p0.z threshold 0–1
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let texel = vec2f(1.0) / u.resolution;
    var bloom = vec3f(0.0);
    var total = 0.0;
    for (var ring = 1; ring <= 4; ring = ring + 1) {
        for (var k = 0; k < 8; k = k + 1) {
            let a = f32(k) * 0.785398 + f32(ring) * 0.4;
            let r = f32(ring) / 4.0 * u.p0.x;
            let s = textureSample(input_texture, input_sampler, input.tex_coord + vec2f(cos(a), sin(a)) * r * texel);
            let bright = max(straight(s) - vec3f(u.p0.z), vec3f(0.0));
            let weight = 1.0 - f32(ring) / 5.0;
            bloom = bloom + bright * weight;
            total = total + weight;
        }
    }
    let rgb = clamp(straight(c) + bloom / total * u.p0.y, vec3f(0.0), vec3f(1.0));
    return vec4f(rgb * c.a, c.a);
}
