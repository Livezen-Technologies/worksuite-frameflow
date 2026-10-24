import { describe, expect, test } from "bun:test";
import { BACKDROP_TYPES, backdropLottie, backdropSpec, isBackdrop, parseBackdropSpec } from "../backdrop";

describe("template backdrops", () => {
	test("every type builds a frame-sized Lottie that lasts the template", () => {
		for (const t of BACKDROP_TYPES) {
			const json = backdropLottie({ bg: { t, c: ["#FFB020", "#E2531B", "#7A1E0E"] }, width: 1920, height: 1080, duration: 5 });
			expect(json.w).toBe(1920);
			expect(json.h).toBe(1080);
			expect(json.op).toBe(150);
			expect(json.layers.length).toBeGreaterThanOrEqual(t === "grad" ? 1 : 2);
			// Valid JSON with no NaN or Infinity anywhere.
			expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity|null/);
		}
	});
	test("spec round-trips and rejects junk", () => {
		const bg = { t: "confetti" as const, c: ["#111111", "#222222", "#333333"] };
		const spec = backdropSpec({ bg, width: 1080, height: 1920, duration: 4.5 });
		expect(parseBackdropSpec(spec)).toEqual({ bg, width: 1080, height: 1920, duration: 4.5 });
		expect(parseBackdropSpec("nope|#fff|10x10|1")).toBeNull();
		expect(isBackdrop({ t: "rays", c: [] })).toBe(false);
	});
	test("confetti wraps from the bottom to the top with a held keyframe", () => {
		const json = backdropLottie({ bg: { t: "confetti", c: ["#000000", "#111111", "#FFFFFF"] }, width: 100, height: 100, duration: 10 });
		expect(JSON.stringify(json)).toContain('"h":1');
	});
});
