import { describe, expect, test } from "bun:test";
import {
	estimateShift,
	flickerCorrection,
	smooth,
	stabilizeOffsets,
} from "../analysis";

function frame({
	w,
	h,
	ox,
	oy,
}: {
	w: number;
	h: number;
	ox: number;
	oy: number;
}) {
	const f = new Float32Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const u = x - ox;
			const v = y - oy;
			f[y * w + x] =
				0.5 +
				0.5 * Math.sin(u * 0.7) * Math.cos(v * 0.45) +
				((u * 7 + v * 13) % 5) * 0.02;
		}
	}
	return f;
}

describe("stabilize and flicker analysis", () => {
	test("finds the shift between frames", () => {
		const a = frame({ w: 64, h: 36, ox: 0, oy: 0 });
		const b = frame({ w: 64, h: 36, ox: 3, oy: -2 });
		expect(estimateShift({ a, b, width: 64, height: 36 })).toEqual({
			dx: 3,
			dy: -2,
		});
	});

	test("smooths shake and keeps a steady pan", () => {
		const shake = [2, -2, 2, -2, 2, -2].map((dx) => ({ dx, dy: 0 }));
		const offsets = stabilizeOffsets({ shifts: shake, window: 3 });
		expect(Math.max(...offsets.map((o) => Math.abs(o.x)))).toBeLessThanOrEqual(
			2,
		);
		const pan = [1, 1, 1, 1, 1, 1].map((dx) => ({ dx, dy: 0 }));
		const middle = stabilizeOffsets({ shifts: pan, window: 3 }).slice(1, -1);
		for (const o of middle) expect(Math.abs(o.x)).toBeLessThan(1e-9);
	});

	test("evens out brightness flicker", () => {
		const means = [0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5];
		const fix = flickerCorrection({ means, window: 5 });
		const fixed = means.map((m, i) => m * 2 ** (fix[i] ?? 0));
		const spread = Math.max(...fixed) - Math.min(...fixed);
		expect(spread).toBeLessThan(0.04);
		expect(smooth({ values: [0, 3, 0], window: 3 })).toEqual([1.5, 1, 1.5]);
	});
});

describe("motion tracking", () => {
	test("follows a moving square", async () => {
		const { trackPatch } = await import("../analysis");
		const W = 80;
		const H = 60;
		const frames = Array.from({ length: 8 }, (_, t) => {
			const f = new Float32Array(W * H).fill(0.2);
			const ox = 20 + t * 4;
			const oy = 20 + t * 2;
			for (let y = oy - 4; y <= oy + 4; y++)
				for (let x = ox - 4; x <= ox + 4; x++) f[y * W + x] = 0.9;
			return f;
		});
		const path = trackPatch({
			frames,
			width: W,
			height: H,
			cx: 20,
			cy: 20,
			r: 6,
			range: 8,
		});
		expect(path.at(-1)).toEqual({ x: 48, y: 34 });
	});
});
