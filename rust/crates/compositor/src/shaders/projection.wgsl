// 360° video (SRS VR-08, VR-10, VR-16, VR-23): samples an equirectangular
// source through a virtual camera.
//
// mode 0 reframes to flat video. lens blends continuously between
// projections so they can be animated: 0 natural (rectilinear), 1 wide
// (equidistant fisheye), 2 stereographic (tiny planet looking down, rabbit
// hole looking up).
// mode 1 keeps the output equirectangular and only turns the sphere
// (reorient / set the front).

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct ProjectionUniforms {
    // yaw, pitch, roll, fov (radians)
    angles: vec4f,
    resolution: vec2f,
    lens: f32,
    mode: f32,
    opacity: f32,
    _p0: f32,
    _p1: f32,
    _p2: f32,
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
@group(1) @binding(0) var<uniform> u: ProjectionUniforms;

const PI: f32 = 3.14159265358979;

// Camera to world: roll about the view axis, then pitch, then yaw.
fn orient(d: vec3f) -> vec3f {
    let yaw = u.angles.x;
    let pitch = u.angles.y;
    let roll = u.angles.z;
    let cr = cos(roll);
    let sr = sin(roll);
    var v = vec3f(d.x * cr - d.y * sr, d.x * sr + d.y * cr, d.z);
    let cp = cos(pitch);
    let sp = sin(pitch);
    v = vec3f(v.x, v.y * cp + v.z * sp, -v.y * sp + v.z * cp);
    let cy = cos(yaw);
    let sy = sin(yaw);
    return vec3f(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
}

fn sample_direction(d: vec3f) -> vec4f {
    let lon = atan2(d.x, d.z);
    let lat = asin(clamp(d.y, -1.0, 1.0));
    // Wrap across the ±180° seam.
    let uv = vec2f(fract(lon / (2.0 * PI) + 0.5), clamp(0.5 - lat / PI, 0.0, 1.0));
    return textureSampleLevel(source_texture, source_sampler, uv, 0.0);
}

// p is in units of the half-height of the output.
fn rectilinear(p: vec2f, fov: f32) -> vec3f {
    let t = tan(min(fov, 3.0) * 0.5);
    return normalize(vec3f(p.x * t, p.y * t, 1.0));
}

fn from_angle(p: vec2f, theta: f32) -> vec3f {
    let r = length(p);
    if (r < 1e-6) { return vec3f(0.0, 0.0, 1.0); }
    let s = sin(theta);
    return vec3f(p.x / r * s, p.y / r * s, cos(theta));
}

fn fisheye(p: vec2f, fov: f32) -> vec3f {
    return from_angle(p, min(length(p) * fov * 0.5, PI));
}

fn stereographic(p: vec2f, fov: f32) -> vec3f {
    let k = tan(min(fov, 6.0) * 0.25);
    return from_angle(p, 2.0 * atan(length(p) * k));
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let uv = input.tex_coord;
    var dir: vec3f;
    if (u.mode > 0.5) {
        let lon = (uv.x - 0.5) * 2.0 * PI;
        let lat = (0.5 - uv.y) * PI;
        dir = vec3f(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
    } else {
        let aspect = u.resolution.x / max(u.resolution.y, 1.0);
        let p = vec2f((uv.x * 2.0 - 1.0) * aspect, 1.0 - uv.y * 2.0);
        let fov = u.angles.w;
        let lens = clamp(u.lens, 0.0, 2.0);
        if (lens <= 1.0) {
            dir = normalize(mix(rectilinear(p, fov), fisheye(p, fov), lens));
        } else {
            dir = normalize(mix(fisheye(p, fov), stereographic(p, fov), lens - 1.0));
        }
    }
    let color = sample_direction(orient(dir));
    return vec4f(color.rgb, color.a * u.opacity);
}
