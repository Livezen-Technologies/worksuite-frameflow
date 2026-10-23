import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STYLISE_EFFECTS } from "../definitions/stylise";

const pipelineSource = readFileSync(
	join(import.meta.dir, "../../../../../rust/crates/effects/src/pipeline.rs"),
	"utf8",
);
const engineStyliseShaders = [
	...pipelineSource.matchAll(
		/\("([a-z-]+)", include_str!\("shaders\/[a-z_]+\.wgsl"\)\)/g,
	),
].map((match) => match[1]);

function defaults(params: (typeof STYLISE_EFFECTS)[number]["params"]) {
	return Object.fromEntries(params.map((param) => [param.key, param.default]));
}

function vec(value: unknown): number[] {
	if (!Array.isArray(value)) throw new Error("expected a vector uniform");
	return value.map(Number);
}

describe("stylise effects", () => {
	test("every effect has a shader in the Rust engine, and vice versa", () => {
		const types = STYLISE_EFFECTS.map((effect) => effect.type).sort();
		// HDR colour conversions are applied by the renderer, not offered as
		// effects; the 360° nadir patch is defined with the other 360° tools.
		const internal = new Set(["hdr-from-sdr", "hdr-preview", "nadir"]);
		expect(types).toEqual(
			[...engineStyliseShaders].filter((id) => !internal.has(id)).sort(),
		);
	});

	test("types are unique and each effect has a category", () => {
		const types = STYLISE_EFFECTS.map((effect) => effect.type);
		expect(new Set(types).size).toBe(types.length);
		for (const effect of STYLISE_EFFECTS) expect(effect.category).toBeTruthy();
	});

	test("default params produce finite four-number p0 and the time", () => {
		for (const effect of STYLISE_EFFECTS) {
			const [pass] = effect.renderer.passes;
			expect(pass.shader).toBe(effect.type);
			const uniforms = pass.uniforms({
				effectParams: defaults(effect.params),
				width: 1920,
				height: 1080,
				time: 2.5,
			});
			expect(uniforms.u_time).toBe(2.5);
			const p0 = vec(uniforms.u_p0);
			expect(p0, effect.type).toHaveLength(4);
			for (const value of p0)
				expect(Number.isFinite(value), `${effect.type} p0`).toBe(true);
			expect(
				Object.keys(uniforms).every((key) =>
					["u_time", "u_p0", "u_p1"].includes(key),
				),
			).toBe(true);
		}
	});

	test("booleans and select values reach the shader as numbers", () => {
		const edge = STYLISE_EFFECTS.find(
			(effect) => effect.type === "edge-detect",
		)!;
		const off = edge.renderer.passes[0].uniforms({
			effectParams: { amount: 100, glow: false },
			width: 1,
			height: 1,
			time: 0,
		});
		const on = edge.renderer.passes[0].uniforms({
			effectParams: { amount: 100, glow: true },
			width: 1,
			height: 1,
			time: 0,
		});
		expect(vec(off.u_p0)[1]).toBe(0);
		expect(vec(on.u_p0)[1]).toBe(1);
		const mirror = STYLISE_EFFECTS.find((effect) => effect.type === "mirror")!;
		const fourWay = mirror.renderer.passes[0].uniforms({
			effectParams: { mode: "4" },
			width: 1,
			height: 1,
			time: 0,
		});
		expect(vec(fourWay.u_p0)[0]).toBe(4);
	});
});
