import { describe, expect, test } from "bun:test";
import { hexToRgb } from "../nadir";
import { warpNadirLogo } from "../nadir-logo";

describe("nadir patch", () => {
	test("colour parsing", () => {
		expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
		expect(hexToRgb("nope")).toEqual([0, 0, 0]);
	});

	test("logo lands in the bottom band only, centre of the logo at the pole", () => {
		// 3×3 logo: red centre, blue elsewhere.
		const logo = { width: 3, height: 3, data: new Uint8ClampedArray(36) };
		for (let i = 0; i < 9; i++) logo.data.set(i === 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
		const w = 64;
		const h = 32;
		const out = warpNadirLogo({ logo, width: w, height: h, sizeDeg: 45 });
		const at = ({ x, y }: { x: number; y: number }) => Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
		expect(at({ x: 10, y: 5 })[3]).toBe(0); // sky: untouched
		expect(at({ x: 10, y: h - 9 })[3]).toBe(0); // above the 45° band (8 rows)
		expect(at({ x: 10, y: h - 1 })).toEqual([255, 0, 0, 255]); // pole: logo centre
		expect(at({ x: 10, y: h - 8 })[2]).toBe(255); // band edge: logo rim
	});
});
