// 360° video (SRS VR-08, VR-10, VR-16, VR-23): samples an equirectangular
// source through a virtual camera.
//
// mode 0 reframes to flat video. lens blends continuously between
// projections so they can be animated: 0 natural (rectilinear), 1 wide
// (equidistant fisheye), 2 stereographic (tiny planet looking down, rabbit
// hole looking up).
// mode 1 keeps the output equirectangular and only turns the sphere
// (reorient / set the front).
// mode 2 lays a flat source (a title or image) on the sphere, facing
// yaw/pitch and fov wide, into an equirectangular output (VR-17).

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
    // Source width / height (mode 2).
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

// World to the placed layer's frame: undo yaw, then pitch, then roll.
fn unorient(d: vec3f) -> vec3f {
    let cy = cos(u.angles.x);
    let sy = sin(u.angles.x);
    var v = vec3f(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
    let cp = cos(u.angles.y);
    let sp = sin(u.angles.y);
    v = vec3f(v.x, v.y * cp - v.z * sp, v.y * sp + v.z * cp);
    let cr = cos(u.angles.z);
    let sr = sin(u.angles.z);
    return vec3f(v.x * cr + v.y * sr, -v.x * sr + v.y * cr, v.z);
}

fn place_flat(uv: vec2f) -> vec4f {
    let lon = (uv.x - 0.5) * 2.0 * PI;
    let lat = (0.5 - uv.y) * PI;
    let d = unorient(vec3f(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon)));
    if (d.z <= 0.01) {
        return vec4f(0.0);
    }
    // The layer is a flat card fov wide at distance 1, seen straight on.
    var half_w = tan(min(u.angles.w, 3.0) * 0.5);
    if (u._p1 > 0.0) {
        half_w = u._p1;
    }
    let half_h = half_w / max(u._p0, 0.01);
    let s = vec2f(0.5 + d.x / d.z / (2.0 * half_w), 0.5 - d.y / d.z / (2.0 * half_h));
    if (any(s < vec2f(0.0)) || any(s > vec2f(1.0))) {
        return vec4f(0.0);
    }
    let color = textureSampleLevel(source_texture, source_sampler, s, 0.0);
    return vec4f(color.rgb, color.a * u.opacity);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let uv = input.tex_coord;
    if (u.mode > 1.5) {
        return place_flat(uv);
    }
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
