import { describe, expect, test } from "bun:test";
import {
	COLOR_WHEELS,
	colorGradeEffectDefinition,
	colorGradeUniforms,
	isNeutralGrade,
	wheelToRgb,
} from "../definitions/color-grade";

const defaults = () =>
	Object.fromEntries(
		colorGradeEffectDefinition.params.map((param) => [
			param.key,
			param.default,
		]),
	);

function vec(value: unknown): number[] {
	if (!Array.isArray(value)) throw new Error("expected a vector uniform");
	return value.map(Number);
}

describe("color grade", () => {
	test("defaults are a neutral grade with all-zero uniforms", () => {
		const params = defaults();
		expect(isNeutralGrade(params)).toBe(true);
		const uniforms = colorGradeUniforms(params);
		for (const value of Object.values(uniforms)) {
			expect(value).toEqual([0, 0, 0, 0]);
		}
		expect(Object.keys(uniforms).sort()).toEqual(
			["u_balance", "u_gain", "u_gamma", "u_lift", "u_offset", "u_tone"].sort(),
		);
	});

	test("a wheel push changes hue balance but not brightness", () => {
		for (const [x, y] of [
			[1, 0],
			[0, 1],
			[-0.6, 0.3],
			[0.2, -0.9],
		]) {
			const [r, g, b] = wheelToRgb({ x, y });
			expect(r + g + b).toBeCloseTo(0, 10);
		}
		const [r, g, b] = wheelToRgb({ x: 1, y: 0 });
		expect(r).toBeCloseTo(1);
		expect(g).toBeCloseTo(-0.5);
		expect(b).toBeCloseTo(-0.5);
	});

	test("the puck is clamped to the disc edge", () => {
		const [r] = wheelToRgb({ x: 3, y: 0 });
		expect(r).toBeCloseTo(1);
	});

	test("sliders and masters reach the shader scaled", () => {
		const params = {
			...defaults(),
			exposure: 1.5,
			contrast: 20,
			saturation: -50,
			temperature: 30,
			gainM: 0.5,
		};
		const uniforms = colorGradeUniforms(params);
		expect(uniforms.u_tone).toEqual([1.5, 0.2, -0.5, 0]);
		expect(vec(uniforms.u_balance)[0]).toBeCloseTo(0.3);
		const gain = COLOR_WHEELS.find((w) => w.key === "gain")!;
		expect(vec(uniforms.u_gain)[3]).toBeCloseTo(0.5 * gain.strength);
		expect(isNeutralGrade(params)).toBe(false);
	});

	test("bad stored values fall back to zero", () => {
		const uniforms = colorGradeUniforms({
			...defaults(),
			exposure: "abc",
			liftX: Number.NaN,
		});
		expect(vec(uniforms.u_tone)[0]).toBe(0);
		expect(uniforms.u_lift).toEqual([0, 0, 0, 0]);
	});
});
