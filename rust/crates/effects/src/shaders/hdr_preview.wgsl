struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

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

// HLG working signal to SDR for showing an HDR project on an SDR display
// (SRS HD-09): HLG OOTF to nits, 203 nits to SDR white, highlight roll-off
// (p0.x), BT.2020 to Rec. 709, sRGB.

fn hlg_to_scene(s: f32) -> f32 {
    let a = 0.17883277;
    let b = 1.0 - 4.0 * a;
    let c = 0.5 - a * log(4.0 * a);
    let e = max(s, 0.0);
    if (e <= 0.5) { return e * e / 3.0; }
    return (exp((e - c) / a) + b) / 12.0;
}

fn rolloff(x: f32, r: f32) -> f32 {
    let knee = 1.0 - 0.6 * clamp(r, 0.0, 1.0) - 0.15;
    if (x <= knee) { return x; }
    let span = 1.0 - knee;
    return knee + span * (1.0 - exp(-(x - knee) / span));
}

fn srgb(v: f32) -> f32 {
    let x = clamp(v, 0.0, 1.0);
    if (x <= 0.0031308) { return 12.92 * x; }
    return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    if (c.a <= 0.0) { return c; }
    let s = c.rgb / c.a;
    let scene = vec3f(hlg_to_scene(s.r), hlg_to_scene(s.g), hlg_to_scene(s.b));
    let ys = max(dot(scene, vec3f(0.2627, 0.678, 0.0593)), 1e-6);
    let rel = scene * 1000.0 * pow(ys, 0.2) / 203.0;
    let lum = dot(rel, vec3f(0.2627, 0.678, 0.0593));
    let mapped = rolloff(lum, u.p0.x);
    let scale = select(0.0, mapped / lum, lum > 1e-6);
    let toned = rel * scale;
    let out = vec3f(
        dot(toned, vec3f(1.6605, -0.5876, -0.0728)),
        dot(toned, vec3f(-0.1246, 1.1329, -0.0083)),
        dot(toned, vec3f(-0.0182, -0.1006, 1.1187)),
    );
    return vec4f(vec3f(srgb(out.r), srgb(out.g), srgb(out.b)) * c.a, c.a);
}
