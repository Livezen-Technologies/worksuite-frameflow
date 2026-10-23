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

// SDR (sRGB / Rec. 709) layer into an HDR project's HLG working signal
// (SRS HD-04, HD-12): white lands at graphics white, p0.x nits (default
// 203), in BT.2020 on a 1,000-nit HLG display.

fn straight(c: vec4f) -> vec3f {
    if (c.a <= 0.0) { return vec3f(0.0); }
    return c.rgb / c.a;
}

fn srgb_to_linear(v: vec3f) -> vec3f {
    let lo = v / 12.92;
    let hi = pow((v + 0.055) / 1.055, vec3f(2.4));
    return select(hi, lo, v <= vec3f(0.04045));
}

fn hlg_oetf(e: f32) -> f32 {
    let a = 0.17883277;
    let b = 1.0 - 4.0 * a;
    let c = 0.5 - a * log(4.0 * a);
    if (e <= 1.0 / 12.0) { return sqrt(3.0 * e); }
    return a * log(12.0 * e - b) + c;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let lin709 = srgb_to_linear(clamp(straight(c), vec3f(0.0), vec3f(1.0)));
    let lin2020 = vec3f(
        dot(lin709, vec3f(0.6274, 0.3293, 0.0433)),
        dot(lin709, vec3f(0.0691, 0.9195, 0.0114)),
        dot(lin709, vec3f(0.0164, 0.0880, 0.8956)),
    );
    // Display light relative to the 1,000-nit HLG peak, then the inverse
    // OOTF (gamma 1.2) back to scene light for the OETF.
    let white = select(u.p0.x, 203.0, u.p0.x <= 0.0);
    let display = lin2020 * (white / 1000.0);
    let yd = max(dot(display, vec3f(0.2627, 0.678, 0.0593)), 1e-6);
    let scene = display * pow(yd, (1.0 / 1.2) - 1.0);
    let hlg = vec3f(hlg_oetf(scene.r), hlg_oetf(scene.g), hlg_oetf(scene.b));
    return vec4f(clamp(hlg, vec3f(0.0), vec3f(1.0)) * c.a, c.a);
}
