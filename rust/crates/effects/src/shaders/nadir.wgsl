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

// Nadir patch on an equirectangular frame (SRS VR-19): covers the bottom
// pole, where the tripod or selfie stick shows.
// p0.x size: degrees up from straight down (5–45) / 90
// p0.y feather 0–1 (share of the patch that fades out)
// p0.z mode: 0 blurred fill from the ring around the patch, 1 solid colour
// p1 colour (rgb) for mode 1
const SAMPLES: i32 = 48;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    // v = 1 is straight down; the patch covers the last `band` of the frame.
    let band = clamp(u.p0.x, 0.01, 0.5) * 0.5;
    let from_bottom = 1.0 - input.tex_coord.y;
    if (from_bottom >= band) {
        return c;
    }
    let r = from_bottom / band; // 0 at the pole, 1 at the patch edge
    var fill: vec4f;
    if (u.p0.z >= 0.5) {
        fill = vec4f(u.p1.rgb, 1.0);
    } else {
        // Average the ring just outside the patch: nearer the pole, a wider
        // span of longitudes, so it melts into one colour at the bottom.
        let ring_v = 1.0 - band * 1.05;
        let span = mix(1.0, 0.04, r);
        var sum = vec4f(0.0);
        for (var i = 0; i < SAMPLES; i = i + 1) {
            let t = (f32(i) + 0.5) / f32(SAMPLES) - 0.5;
            let x = fract(input.tex_coord.x + t * span);
            sum = sum + textureSampleLevel(input_texture, input_sampler, vec2f(x, ring_v), 0.0);
        }
        fill = sum / f32(SAMPLES);
    }
    let feather = clamp(u.p0.y, 0.0, 1.0);
    let keep = smoothstep(1.0 - feather, 1.0, r);
    return mix(fill, c, keep);
}
