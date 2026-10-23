import { describe, expect, test } from "bun:test";
import {
	bakeLut,
	DEFAULT_CURVES,
	DEFAULT_QUALIFIER,
	evaluateCurve,
	gradeColor,
	hslToRgb,
	parseCurve,
	qualifierWeight,
	rgbToHsl,
	serializeCurve,
} from "../curves";

describe("curves", () => {
	test("identity curve passes values through", () => {
		for (const x of [0, 0.2, 0.5, 0.9, 1])
			expect(evaluateCurve({ points: DEFAULT_CURVES.luma, x })).toBeCloseTo(
				x,
				6,
			);
	});

	test("monotone: an S-curve never overshoots its points", () => {
		const s: [number, number][] = [
			[0, 0],
			[0.25, 0.15],
			[0.75, 0.85],
			[1, 1],
		];
		let previous = -1;
		for (let i = 0; i <= 100; i++) {
			const y = evaluateCurve({ points: s, x: i / 100 });
			expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(1);
			previous = y;
		}
		expect(evaluateCurve({ points: s, x: 0.25 })).toBeCloseTo(0.15, 6);
	});

	test("hue curves wrap around red", () => {
		const points: [number, number][] = [
			[0.1, 0.7],
			[0.9, 0.7],
		];
		expect(evaluateCurve({ points, x: 0, periodic: true })).toBeCloseTo(0.7, 3);
		expect(evaluateCurve({ points, x: 1, periodic: true })).toBeCloseTo(0.7, 3);
	});

	test("serialise and parse round-trip; junk falls back", () => {
		const points: [number, number][] = [
			[0, 0.1],
			[0.5, 0.6],
			[1, 0.9],
		];
		expect(parseCurve({ text: serializeCurve(points), fallback: [] })).toEqual(
			points,
		);
		expect(
			parseCurve({ text: "nonsense", fallback: DEFAULT_CURVES.luma }),
		).toEqual(DEFAULT_CURVES.luma);
	});

	test("HSL conversion round-trips", () => {
		const rgb: [number, number, number] = [0.8, 0.3, 0.1];
		const back = hslToRgb(rgbToHsl(rgb));
		for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(rgb[i], 6);
	});
});

describe("grading", () => {
	test("neutral settings leave colours alone", () => {
		const c = gradeColor({
			rgb: [0.4, 0.5, 0.6],
			curves: DEFAULT_CURVES,
			qualifier: DEFAULT_QUALIFIER,
		});
		expect(c[0]).toBeCloseTo(0.4, 5);
		expect(c[2]).toBeCloseTo(0.6, 5);
	});

	test("hue vs saturation can remove one colour only", () => {
		// Pull saturation to zero around blue (hue 2/3), keep the rest.
		const curves = {
			...DEFAULT_CURVES,
			hueVsSat: [
				[0, 0.5],
				[0.55, 0.5],
				[0.6667, 0],
				[0.78, 0.5],
				[1, 0.5],
			] as [number, number][],
		};
		const blue = gradeColor({
			rgb: [0.1, 0.1, 0.9],
			curves,
			qualifier: DEFAULT_QUALIFIER,
		});
		const red = gradeColor({
			rgb: [0.9, 0.2, 0.1],
			curves,
			qualifier: DEFAULT_QUALIFIER,
		});
		expect(Math.max(...blue) - Math.min(...blue)).toBeLessThan(0.05);
		expect(red[0]).toBeCloseTo(0.9, 3);
	});

	test("qualifier selects skin-tone orange, not blue or grey", () => {
		const q = { ...DEFAULT_QUALIFIER, enabled: true };
		expect(
			qualifierWeight({ hsl: rgbToHsl([0.85, 0.55, 0.4]), q }),
		).toBeGreaterThan(0.9);
		expect(qualifierWeight({ hsl: rgbToHsl([0.2, 0.3, 0.9]), q })).toBe(0);
		expect(qualifierWeight({ hsl: rgbToHsl([0.5, 0.5, 0.5]), q })).toBe(0);
	});

	test("show mask returns the selection in black and white", () => {
		const q = { ...DEFAULT_QUALIFIER, enabled: true, showMask: true };
		expect(
			gradeColor({
				rgb: [0.85, 0.55, 0.4],
				curves: DEFAULT_CURVES,
				qualifier: q,
			})[0],
		).toBeGreaterThan(0.9);
		expect(
			gradeColor({
				rgb: [0.2, 0.3, 0.9],
				curves: DEFAULT_CURVES,
				qualifier: q,
			})[0],
		).toBe(0);
	});

	test("baked LUT is the right size and neutral at the corners", () => {
		const lut = bakeLut({
			curves: DEFAULT_CURVES,
			qualifier: DEFAULT_QUALIFIER,
			size: 5,
		});
		expect(lut.length).toBe(5 ** 3 * 4);
		expect([...lut.slice(0, 4)]).toEqual([0, 0, 0, 255]);
		expect([...lut.slice(-4)]).toEqual([255, 255, 255, 255]);
		// Red-only corner: index r=4,g=0,b=0.
		expect([...lut.slice(4 * 4, 4 * 4 + 3)]).toEqual([255, 0, 0]);
	});
});
