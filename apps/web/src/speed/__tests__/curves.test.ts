import { describe, expect, test } from "bun:test";
import { buildCurvePieces, curveAt } from "../curves";

describe("speed curves", () => {
	test("interpolates control points", () => {
		expect(curveAt({ points: [1, 3], u: 0.5 })).toBe(2);
		expect(curveAt({ points: [1, 2, 1], u: 0.5 })).toBe(2);
		expect(curveAt({ points: [4], u: 0.2 })).toBe(4);
	});

	test("pieces cover the same source, back to back", () => {
		const source = {
			id: "a",
			startTime: 1000,
			trimStart: 500,
			trimEnd: 200,
			sourceSpan: 16_000,
		};
		const pieces = buildCurvePieces({
			source,
			points: [1, 2.5, 1, 0.35, 1],
			segments: 16,
		});
		expect(pieces.length).toBe(16);
		expect(pieces[0]?.startTime).toBe(1000);
		expect(pieces[0]?.trimStart).toBe(500);
		expect(pieces.at(-1)?.trimEnd).toBe(200);
		let t = 1000;
		let src = 0;
		for (const p of pieces) {
			expect(p.startTime).toBe(t);
			t += p.duration;
			expect(p.trimStart).toBe(500 + src);
			expect(Math.abs(p.duration * p.rate - 1000)).toBeLessThan(5);
			src += 1000;
		}
	});

	test("a flat curve at 2x halves the length", () => {
		const pieces = buildCurvePieces({
			source: {
				id: "a",
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
				sourceSpan: 8000,
			},
			points: [1],
			base: 2,
			segments: 4,
		});
		expect(pieces.reduce((n, p) => n + p.duration, 0)).toBe(4000);
	});
});
