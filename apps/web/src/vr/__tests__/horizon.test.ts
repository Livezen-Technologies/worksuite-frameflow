import { describe, expect, test } from "bun:test";
import { parsePayload, type Quat, type Vec3 } from "../gpmf";
import {
	anglesOf,
	axisAngle,
	correctionFor,
	fromGravity,
	integrateImu,
	multiply,
	normalize,
	orientationAt,
	orientOf,
	rotate,
} from "../horizon";

const close = ({ a, b, digits = 4 }: { a: number[]; b: number[]; digits?: number }) =>
	a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const sameRotation = ({ a, b }: { a: Quat; b: Quat }) => {
	const s = Math.sign(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) || 1;
	close({ a, b: b.map((v) => v * s) });
};
const tilted = ({ roll, pitch, yaw = 0 }: { roll: number; pitch: number; yaw?: number }): Quat =>
	normalize(
		multiply(
			multiply(
				axisAngle({ axis: [0, 1, 0], angle: yaw }),
				axisAngle({ axis: [1, 0, 0], angle: pitch }),
			),
			axisAngle({ axis: [0, 0, 1], angle: roll }),
		),
	);

describe("horizon lock maths", () => {
	test("angles split back into the same rotation", () => {
		for (const q of [tilted({ roll: 0.3, pitch: -0.4, yaw: 1.2 }), tilted({ roll: -1, pitch: 0.2, yaw: -2.5 }), tilted({ roll: 0.05, pitch: 0.6, yaw: 0 })])
			sameRotation({ a: orientOf(anglesOf(q)), b: q });
	});

	test("level keeps the horizon flat and follows the heading", () => {
		const q = tilted({ roll: 0.35, pitch: -0.25, yaw: 1.1 });
		const c = orientOf(correctionFor({ q, mode: "level" }));
		const world = (v: Vec3) => rotate({ q: multiply(q, c), v });
		close({ a: world([0, 1, 0]), b: [0, 1, 0] });
		const ahead = world([0, 0, 1]);
		expect(Math.atan2(ahead[0], ahead[2])).toBeCloseTo(1.1, 4);
	});

	test("lock holds the view still", () => {
		const q = tilted({ roll: 0.35, pitch: -0.25, yaw: 1.1 });
		const c = orientOf(correctionFor({ q, mode: "lock" }));
		sameRotation({ a: multiply(q, c), b: [1, 0, 0, 0] });
	});

	test("gravity gives the tilt", () => {
		const q = tilted({ roll: 0.3, pitch: 0.2 });
		const g = rotate({ q: [q[0], -q[1], -q[2], -q[3]], v: [0, -1, 0] });
		close({ a: rotate({ q: fromGravity(g), v: g }), b: [0, -1, 0] });
		const c = orientOf(correctionFor({ q: fromGravity(g), mode: "level" }));
		close({ a: rotate({ q: multiply(fromGravity(g), c), v: [0, 1, 0] }), b: [0, 1, 0] });
	});

	test("gyro integration turns and settles on gravity", () => {
		const times = Array.from({ length: 2001 }, (_, i) => i / 200);
		// Rolling at 0.2 rad/s for 10 s, while the accelerometer agrees.
		const gyro = { times, values: times.map((): Vec3 => [0, 0, 0.2]) };
		const accel = {
			times,
			values: times.map((t): Vec3 => rotate({ q: axisAngle({ axis: [0, 0, 1], angle: -0.2 * t }), v: [0, 1, 0] })),
		};
		const { orientations } = integrateImu({ gyro, accel });
		const end = orientations[orientations.length - 1];
		close({ a: rotate({ q: end, v: [1, 0, 0] }), b: [Math.cos(2), Math.sin(2), 0], digits: 2 });
	});

	test("orientation between samples", () => {
		const a = tilted({ roll: 0, pitch: 0 });
		const b = tilted({ roll: 0.4, pitch: 0 });
		sameRotation({
			a: orientationAt({ times: [0, 1], orientations: [a, b], time: 0.5 }),
			b: tilted({ roll: 0.2, pitch: 0 }),
		});
	});
});

describe("GPMF", () => {
	const klv = ({ key, type, size, rows }: { key: string; type: string; size: number; rows: number[][] }) => {
		const width = size / (type === "s" ? 2 : 4);
		const body = new Uint8Array(Math.ceil((size * rows.length) / 4) * 4);
		const view = new DataView(body.buffer);
		rows.flat().forEach((v, i) => (type === "s" ? view.setInt16(i * 2, v) : view.setFloat32(i * 4, v)));
		void width;
		const head = new Uint8Array(8);
		head.set(Array.from(key, (c) => c.charCodeAt(0)));
		head[4] = type === "\0" ? 0 : type.charCodeAt(0);
		head[5] = size;
		new DataView(head.buffer).setUint16(6, rows.length);
		const out = new Uint8Array(8 + body.length);
		out.set(head);
		out.set(body, 8);
		return out;
	};
	test("reads scaled CORI rows inside DEVC/STRM", () => {
		const scal = klv({ key: "SCAL", type: "s", size: 2, rows: [[32767]] });
		const cori = klv({ key: "CORI", type: "s", size: 8, rows: [[32767, 0, 0, 0], [23170, 23170, 0, 0]] });
		const strm = new Uint8Array([...Array.from("STRM", (c) => c.charCodeAt(0)), 0, 1, 0, scal.length + cori.length, ...scal, ...cori]);
		const devc = new Uint8Array([...Array.from("DEVC", (c) => c.charCodeAt(0)), 0, 1, 0, strm.length, ...strm]);
		const rows = parsePayload(devc).get("CORI") ?? [];
		expect(rows.length).toBe(2);
		close({ a: rows[1], b: [0.7071, 0.7071, 0, 0], digits: 3 });
	});
});
