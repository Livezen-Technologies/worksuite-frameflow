import { describe, expect, test } from "bun:test";
import {
	findSceneCuts,
	histogram,
	histogramDistance,
	shiftTrackElements,
} from "../scenes";

const solid = ([r, g, b]: [number, number, number]) => {
	const px = new Uint8ClampedArray(4 * 16);
	for (let i = 0; i < 16; i++) px.set([r, g, b, 255], i * 4);
	return histogram(px);
};

describe("scene detection", () => {
	test("histogram distance", () => {
		expect(
			histogramDistance({ a: solid([0, 0, 0]), b: solid([0, 0, 0]) }),
		).toBe(0);
		expect(
			histogramDistance({ a: solid([0, 0, 0]), b: solid([255, 255, 255]) }),
		).toBe(1);
	});

	test("finds hard cuts, not gradual change", () => {
		const frames = [
			solid([10, 10, 10]),
			solid([12, 10, 10]),
			solid([10, 12, 10]),
			solid([250, 20, 20]),
			solid([250, 22, 20]),
			solid([248, 20, 20]),
			solid([20, 20, 250]),
			solid([20, 20, 250]),
		];
		const times = frames.map((_, i) => i * 0.5);
		expect(findSceneCuts({ times, histograms: frames })).toEqual([1.5, 3]);
		expect(findSceneCuts({ times, histograms: frames, minGap: 2 })).toEqual([
			1.5,
		]);
	});

	test("shifts later elements on a track", () => {
		const out = shiftTrackElements({
			elements: [{ startTime: 0 }, { startTime: 5 }, { startTime: 9 }],
			from: 5,
			by: 3,
		});
		expect(out.map((e) => e.startTime)).toEqual([0, 8, 12]);
	});
});
