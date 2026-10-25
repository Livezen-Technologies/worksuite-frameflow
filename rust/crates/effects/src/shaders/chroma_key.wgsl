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

fn straight(c: vec4f) -> vec3f {
    if (c.a <= 0.0) { return vec3f(0.0); }
    return c.rgb / c.a;
}

// Chroma (Cb, Cr) of an RGB colour: keying on chroma ignores brightness,
// so shadows and highlights on the green screen key out together.
fn chroma(c: vec3f) -> vec2f {
    return vec2f(
        -0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b,
        0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b,
    );
}

// Green / blue screen key.
// p0.rgb key colour, p0.w similarity 0–1, p1.x smoothness 0–1, p1.y spill 0–1
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let c = textureSample(input_texture, input_sampler, input.tex_coord);
    let s = straight(c);
    let d = distance(chroma(s), chroma(u.p0.rgb));
    let lo = u.p0.w * 0.4;
    let hi = lo + max(u.p1.x * 0.3, 0.001);
    let keep = smoothstep(lo, hi, d);
    // Spill: pull the key colour's channel down to its neighbours' level.
    var rgb = s;
    let key = u.p0.rgb;
    if (u.p1.y > 0.0) {
        if (key.g >= key.r && key.g >= key.b) {
            let limit = max(rgb.r, rgb.b);
            rgb.g = mix(rgb.g, min(rgb.g, limit), u.p1.y);
        } else if (key.b >= key.r) {
            let limit = max(rgb.r, rgb.g);
            rgb.b = mix(rgb.b, min(rgb.b, limit), u.p1.y);
        } else {
            let limit = max(rgb.g, rgb.b);
            rgb.r = mix(rgb.r, min(rgb.r, limit), u.p1.y);
        }
    }
    let a = c.a * keep;
    return vec4f(rgb * a, a);
}
