import { describe, expect, test } from "bun:test";
import { trackPatch } from "@/clip-actions/analysis";
import { directionToUv, uvToDirection } from "../projection";

describe("360° subject tracking", () => {
	test("directions and frame positions agree", () => {
		const uv = directionToUv({ yaw: 90, pitch: 30 });
		expect(uv.u).toBeCloseTo(0.75);
		expect(uv.v).toBeCloseTo(1 / 3);
		expect(uvToDirection(uv).yaw).toBeCloseTo(90);
		expect(uvToDirection(uv).pitch).toBeCloseTo(30);
	});

	test("follows a subject across the seam", () => {
		const width = 120;
		const height = 60;
		const frames = Array.from({ length: 20 }, (_, f) => {
			const frame = new Float32Array(width * height);
			const cx = (100 + f * 3) % width;
			for (let y = 25; y < 35; y++)
				for (let dx = -5; dx <= 5; dx++)
					frame[y * width + ((cx + dx + width) % width)] = 1;
			return frame;
		});
		const path = trackPatch({ frames, width, height, cx: 100, cy: 30, r: 6, range: 6, wrapX: true });
		// 19 steps of 3 px: straight through the right edge, not back round.
		expect(path.at(-1)?.x).toBe(157);
		expect(path.at(-1)?.y).toBe(30);
	});
});
