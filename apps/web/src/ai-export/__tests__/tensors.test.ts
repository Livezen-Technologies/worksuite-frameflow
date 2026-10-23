import { describe, expect, test } from "bun:test";
import { chwToRgba, cropRgba, padRgba, planTiles, rgbaToChw } from "../tensors";

describe("AI export tensors", () => {
	test("RGBA round-trips through planar floats", () => {
		const rgba = new Uint8ClampedArray([10, 20, 30, 255, 200, 100, 0, 255]);
		const chw = rgbaToChw({ rgba, width: 2, height: 1 });
		expect(Array.from(chw.slice(0, 2)).map((v) => Math.round(v * 255))).toEqual([10, 200]);
		expect(Array.from(chwToRgba({ data: chw, width: 2, height: 1 }))).toEqual(Array.from(rgba));
	});

	test("tiles cover the frame once, with overlap inside bounds", () => {
		const tiles = planTiles({ width: 300, height: 130, tile: 128, overlap: 8 });
		expect(tiles.length).toBe(6);
		const kept = tiles.reduce((n, t) => n + t.keepWidth * t.keepHeight, 0);
		expect(kept).toBe(300 * 130);
		for (const t of tiles) {
			expect(t.x).toBeGreaterThanOrEqual(0);
			expect(t.x + t.width).toBeLessThanOrEqual(300);
			expect(t.keepX - t.x).toBeLessThanOrEqual(8);
		}
	});

	test("crop and edge padding", () => {
		const rgba = new Uint8ClampedArray(3 * 2 * 4).map((_, i) => i);
		expect(Array.from(cropRgba({ rgba, width: 3, x: 1, y: 1, cropWidth: 2, cropHeight: 1 }))).toEqual([
			16, 17, 18, 19, 20, 21, 22, 23,
		]);
		const padded = padRgba({ rgba, width: 3, height: 2, multiple: 4 });
		expect([padded.width, padded.height]).toEqual([4, 4]);
		// Last column repeats the edge pixel.
		expect(Array.from(padded.rgba.slice(12, 16))).toEqual([8, 9, 10, 11]);
	});
});
