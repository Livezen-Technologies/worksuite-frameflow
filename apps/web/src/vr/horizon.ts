/**
 * Horizon lock from camera motion (SRS VR-04, VR-12): the camera's
 * orientation over time is turned into 360° camera keyframes that undo its
 * tilt, so the horizon stays level however the camera was held.
 */
import type { MotionSamples, Quat, Vec3 } from "./gpmf";

export type HorizonMode = "level" | "lock";

const DEG = 180 / Math.PI;

export function normalize(q: Quat): Quat {
	const n = Math.hypot(...q) || 1;
	return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Composes rotations left to right: multiply(a, b) applies b, then a. */
export function multiply(...qs: Quat[]): Quat {
	return qs.reduce((a, b) => pair([a, b]));
}

function pair([a, b]: [Quat, Quat]): Quat {
	const [aw, ax, ay, az] = a;
	const [bw, bx, by, bz] = b;
	return [
		aw * bw - ax * bx - ay * by - az * bz,
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
	];
}

export const conjugate = ([w, x, y, z]: Quat): Quat => [w, -x, -y, -z];

/** Rotates v by q. */
export function rotate({ q, v }: { q: Quat; v: Vec3 }): Vec3 {
	const p = multiply(multiply(q, [0, ...v]), conjugate(q));
	return [p[1], p[2], p[3]];
}

export function axisAngle({ axis, angle }: { axis: Vec3; angle: number }): Quat {
	const n = Math.hypot(...axis) || 1;
	const s = Math.sin(angle / 2) / n;
	return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** The shortest rotation taking direction a onto direction b. */
export function between({ a, b }: { a: Vec3; b: Vec3 }): Quat {
	const na = Math.hypot(...a) || 1;
	const nb = Math.hypot(...b) || 1;
	const u: Vec3 = [a[0] / na, a[1] / na, a[2] / na];
	const v: Vec3 = [b[0] / nb, b[1] / nb, b[2] / nb];
	const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
	if (dot < -0.999999) {
		const axis: Vec3 = Math.abs(u[0]) < 0.9 ? [0, -u[2], u[1]] : [u[2], 0, -u[0]];
		return axisAngle({ axis, angle: Math.PI });
	}
	return normalize([
		1 + dot,
		u[1] * v[2] - u[2] * v[1],
		u[2] * v[0] - u[0] * v[2],
		u[0] * v[1] - u[1] * v[0],
	]);
}

const DOWN: Vec3 = [0, -1, 0];

/** Camera orientation from where gravity points in the camera's frame. */
export const fromGravity = (g: Vec3): Quat => between({ a: g, b: DOWN });

/**
 * Integrates gyro rates (rad/s, camera axes) into orientations, pulled
 * gently towards the accelerometer's idea of "down" so drift can't build up.
 */
export function integrateImu({
	gyro,
	accel,
	pull = 0.02,
}: {
	gyro: { times: number[]; values: Vec3[] };
	accel: { times: number[]; values: Vec3[] };
	pull?: number;
}): { times: number[]; orientations: Quat[] } {
	const accelAt = (t: number): Vec3 => {
		let i = 0;
		while (i + 1 < accel.times.length && accel.times[i + 1] <= t) i++;
		return accel.values[i] ?? [0, 1, 0];
	};
	// A still accelerometer reads "up" (it feels the push of the ground).
	const down = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
	let q = fromGravity(down(accelAt(gyro.times[0] ?? 0)));
	const orientations: Quat[] = [];
	for (let i = 0; i < gyro.times.length; i++) {
		const dt = i > 0 ? gyro.times[i] - gyro.times[i - 1] : 0;
		const w = gyro.values[i];
		const rate = Math.hypot(...w);
		if (rate > 0 && dt > 0)
			q = normalize(multiply(q, axisAngle({ axis: w, angle: rate * dt })));
		const g = down(accelAt(gyro.times[i]));
		const seen = rotate({ q, v: g });
		const fix = between({ a: seen, b: DOWN });
		const partial = normalize([
			1 - pull + pull * fix[0],
			pull * fix[1],
			pull * fix[2],
			pull * fix[3],
		]);
		q = normalize(multiply(partial, q));
		orientations.push(q);
	}
	return { times: gyro.times, orientations };
}

/** Orientations (camera → world) at each sample, whatever the source. */
export function orientationsOf(
	motion: MotionSamples,
): { times: number[]; orientations: Quat[] } | null {
	if (motion.orientations?.length)
		return { times: motion.times, orientations: motion.orientations.map(normalize) };
	if (motion.gravity?.length)
		return { times: motion.times, orientations: motion.gravity.map(fromGravity) };
	if (motion.gyro && motion.accel)
		return integrateImu({ gyro: motion.gyro, accel: motion.accel });
	return null;
}

export function orientationAt({
	times,
	orientations,
	time,
}: {
	times: number[];
	orientations: Quat[];
	time: number;
}): Quat {
	if (time <= times[0]) return orientations[0];
	for (let i = 1; i < times.length; i++) {
		if (times[i] < time) continue;
		const f = (time - times[i - 1]) / Math.max(1e-9, times[i] - times[i - 1]);
		const a = orientations[i - 1];
		let b = orientations[i];
		const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
		if (dot < 0) b = [-b[0], -b[1], -b[2], -b[3]];
		return normalize([
			a[0] + (b[0] - a[0]) * f,
			a[1] + (b[1] - a[1]) * f,
			a[2] + (b[2] - a[2]) * f,
			a[3] + (b[3] - a[3]) * f,
		]);
	}
	return orientations[orientations.length - 1];
}

export interface CameraAngles {
	yaw: number;
	pitch: number;
	roll: number;
}

/**
 * Splits a rotation into the 360° camera's yaw · pitch · roll, in degrees,
 * matching the projection shader's `orient` (roll about the view axis, then
 * pitch, then yaw).
 */
export function anglesOf(q: Quat): CameraAngles {
	const f = rotate({ q, v: [0, 0, 1] });
	const pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
	const yaw = Math.atan2(f[0], f[2]);
	// Undo yaw, then pitch, from the turned x axis: what's left is roll.
	let [x, y, z] = rotate({ q, v: [1, 0, 0] });
	[x, z] = [x * Math.cos(yaw) - z * Math.sin(yaw), x * Math.sin(yaw) + z * Math.cos(yaw)];
	[y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
	void z;
	return { yaw: yaw * DEG, pitch: pitch * DEG, roll: Math.atan2(y, x) * DEG };
}

/** The shader's rotation for given angles in degrees (for checks). */
export function orientOf({ yaw, pitch, roll }: CameraAngles): Quat {
	const ry = axisAngle({ axis: [0, 1, 0], angle: yaw / DEG });
	const rx = axisAngle({ axis: [1, 0, 0], angle: -pitch / DEG });
	const rz = axisAngle({ axis: [0, 0, 1], angle: roll / DEG });
	return normalize(multiply(multiply(ry, rx), rz));
}

/**
 * Camera angles that cancel the camera's orientation q. "level" keeps the
 * camera's heading (the view still turns when the camera turns) and only
 * levels the horizon; "lock" also holds the direction steady.
 */
export function correctionFor({
	q,
	mode,
}: {
	q: Quat;
	mode: HorizonMode;
}): CameraAngles {
	const inverse = conjugate(q);
	if (mode === "lock") return anglesOf(inverse);
	const f = rotate({ q, v: [0, 0, 1] });
	const heading = Math.atan2(f[0], f[2]);
	return anglesOf(
		normalize(multiply(inverse, axisAngle({ axis: [0, 1, 0], angle: heading }))),
	);
}
