import { describe, expect, test } from "bun:test";
import { clampRegion, regionPixels } from "../region";

describe("privacy regions", () => {
	test("stay inside the frame", () => {
		const r = clampRegion({
			x: 0.9,
			y: -0.2,
			width: 0.3,
			height: 2,
			shape: "rect",
			feather: 3,
		});
		expect(r.x).toBeCloseTo(0.7);
		expect(r.y).toBe(0);
		expect(r.height).toBe(1);
		expect(r.feather).toBe(1);
	});

	test("map to pixels with feather from the shorter side", () => {
		const px = regionPixels({
			region: { x: 0.5, y: 0.5, width: 0.25, height: 0.1, shape: "ellipse", feather: 0.5 },
			width: 1920,
			height: 1080,
		});
		expect(px).toEqual({ left: 960, top: 540, width: 480, height: 108, feather: 54 });
	});
});
