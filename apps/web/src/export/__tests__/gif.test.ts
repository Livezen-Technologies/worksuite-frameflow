import { describe, expect, test } from "bun:test";
import { ditherToPalette, estimateGifBytes, gifRepeat } from "../gif";

describe("GIF options", () => {
	test("loop maps to gifenc repeat", () => {
		expect(gifRepeat("forever")).toBe(0);
		expect(gifRepeat("once")).toBe(-1);
		expect(gifRepeat(3)).toBe(2);
	});

	test("dithering a mid grey with black and white mixes both", () => {
		const width = 8;
		const height = 8;
		const rgba = new Uint8Array(width * height * 4).fill(128);
		const out = ditherToPalette({
			rgba,
			width,
			height,
			palette: [
				[0, 0, 0],
				[255, 255, 255],
			],
		});
		const whites = out.reduce((n, v) => n + v, 0);
		expect(whites).toBeGreaterThan(20);
		expect(whites).toBeLessThan(44);
	});

	test("fewer colours and a length limit make smaller estimates", () => {
		const base = { width: 480, height: 270, fps: 15, seconds: 60 };
		const full = estimateGifBytes({
			...base,
			options: { colors: 256, dither: false, loop: "forever" },
		});
		const limited = estimateGifBytes({
			...base,
			options: { colors: 64, dither: false, loop: "forever", maxSeconds: 10 },
		});
		expect(limited).toBeLessThan(full / 6);
	});
});
