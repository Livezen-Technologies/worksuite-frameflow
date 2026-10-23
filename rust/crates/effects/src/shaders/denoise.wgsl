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


// Edge-preserving denoise (bilateral 5×5). p0.x strength 0–1.
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let px = 1.0 / u.resolution;
    let center = textureSampleLevel(input_texture, input_sampler, input.tex_coord, 0.0);
    let strength = clamp(u.p0.x, 0.0, 1.0);
    if (strength <= 0.0) { return center; }
    let range = mix(0.02, 0.14, strength);
    var sum = vec4f(0.0);
    var weight = 0.0;
    for (var y = -2; y <= 2; y++) {
        for (var x = -2; x <= 2; x++) {
            let offset = vec2f(f32(x), f32(y)) * px * (1.0 + strength);
            let c = textureSampleLevel(input_texture, input_sampler, input.tex_coord + offset, 0.0);
            let d = dot(c.rgb - center.rgb, LUMA) ;
            let w = exp(-f32(x * x + y * y) / 4.5) * exp(-(d * d) / (2.0 * range * range));
            sum += c * w;
            weight += w;
        }
    }
    return sum / max(weight, 1e-5);
}
