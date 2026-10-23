/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- loose fixtures */
import { describe, expect, test } from "bun:test";
import { attributePatch } from "../paste-attributes";

const clip = (over: Record<string, unknown>) =>
	({
		id: "x",
		type: "video",
		name: "c",
		startTime: 0,
		duration: 10,
		trimStart: 0,
		trimEnd: 0,
		params: {},
		effects: [],
		...over,
	}) as never;

describe("paste attributes", () => {
	test("copies only the colour grade", () => {
		let n = 0;
		const source = clip({
			params: { "transform.scaleX": 2 },
			effects: [
				{
					id: "g",
					type: "color-grade",
					enabled: true,
					params: { exposure: 1 },
				},
				{ id: "v", type: "vignette", enabled: true, params: {} },
			],
		});
		const target = clip({
			params: { "transform.scaleX": 1 },
			effects: [{ id: "b", type: "blur", enabled: true, params: {} }],
		});
		const patch = attributePatch({
			source,
			target,
			groups: new Set(["grade"]),
			makeId: () => `n${++n}`,
		});
		expect((patch.params as Record<string, unknown>)["transform.scaleX"]).toBe(
			1,
		);
		expect(
			(patch as { effects: { type: string; id: string }[] }).effects.map(
				(e) => e.type,
			),
		).toEqual(["color-grade", "blur"]);
		expect((patch as { effects: { id: string }[] }).effects[0]?.id).toBe("n1");
	});

	test("copies transform and speed", () => {
		const source = clip({
			params: { "transform.scaleX": 2, "transform.rotate": 15 },
			retime: { rate: 2 },
		});
		const target = clip({ params: {}, retime: undefined });
		const patch = attributePatch({
			source,
			target,
			groups: new Set(["transform", "speed"]),
			makeId: () => "id",
		});
		expect(patch.params).toEqual({
			"transform.scaleX": 2,
			"transform.rotate": 15,
		});
		expect((patch as { retime: unknown }).retime).toEqual({ rate: 2 });
	});
});
