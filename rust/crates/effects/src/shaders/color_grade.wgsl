// Primary color grade: exposure, white balance, lift/gamma/gain/offset,
// contrast, highlights/shadows, saturation and vibrance. Input is
// premultiplied; grading runs on straight color and is premultiplied again.

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct ColorGradeUniforms {
    // rgb = per-channel wheel offset, w = master
    lift: vec4f,
    gamma: vec4f,
    gain: vec4f,
    offset: vec4f,
    // exposure (stops), contrast, saturation, vibrance
    tone: vec4f,
    // temperature, tint, highlights, shadows
    balance: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: ColorGradeUniforms;

const LUMA = vec3f(0.2126, 0.7152, 0.0722);

fn wheel(value: vec4f) -> vec3f {
    return value.rgb + vec3f(value.w);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let sampled = textureSample(input_texture, input_sampler, input.tex_coord);
    if (sampled.a <= 0.0) {
        return sampled;
    }
    var color = sampled.rgb / sampled.a;

    let exposure = uniforms.tone.x;
    let contrast = uniforms.tone.y;
    let saturation = uniforms.tone.z;
    let vibrance = uniforms.tone.w;
    let temperature = uniforms.balance.x;
    let tint = uniforms.balance.y;
    let highlights = uniforms.balance.z;
    let shadows = uniforms.balance.w;

    color = color * exp2(exposure);
    color = color * vec3f(1.0 + 0.2 * temperature, 1.0 - 0.2 * tint, 1.0 - 0.2 * temperature);

    // Lift raises blacks, gain scales whites, gamma bends the mids.
    let lift = wheel(uniforms.lift);
    let gain = vec3f(1.0) + wheel(uniforms.gain);
    let gamma = max(vec3f(1.0) + wheel(uniforms.gamma), vec3f(0.05));
    color = gain * (color + lift * (vec3f(1.0) - color));
    color = pow(max(color, vec3f(0.0)), vec3f(1.0) / gamma);
    color = color + wheel(uniforms.offset);

    color = (color - vec3f(0.5)) * (1.0 + contrast) + vec3f(0.5);

    let luma = dot(color, LUMA);
    color = color + vec3f(highlights * 0.5 * smoothstep(0.5, 1.0, luma));
    color = color + vec3f(shadows * 0.5 * (1.0 - smoothstep(0.0, 0.5, luma)));

    let graded_luma = dot(color, LUMA);
    color = mix(vec3f(graded_luma), color, 1.0 + saturation);
    let chroma = max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
    color = mix(vec3f(graded_luma), color, 1.0 + vibrance * (1.0 - clamp(chroma, 0.0, 1.0)));

    color = clamp(color, vec3f(0.0), vec3f(1.0));
    return vec4f(color * sampled.a, sampled.a);
}
