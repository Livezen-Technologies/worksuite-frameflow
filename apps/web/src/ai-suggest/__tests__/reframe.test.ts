/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- partial timeline fixtures */
import { describe, expect, test } from "bun:test";
import type { SceneTracks, TimelineElement } from "@/timeline/types";
import { applyReframe, reframeParams } from "../reframe";

describe("vertical reframing", () => {
	test("16:9 in 9:16 fills the height and follows the subject", () => {
		const frame = { width: 1080, height: 1920 };
		const centre = reframeParams({ aspect: 16 / 9, frame, x: 0.5 });
		expect(centre.positionX).toBe(0);
		expect(centre.scale * 1080 * (9 / 16)).toBeCloseTo(1920);
		// Subject at the left third: picture slides right, never past its edge.
		const left = reframeParams({ aspect: 16 / 9, frame, x: 1 / 3 });
		expect(left.positionX).toBeCloseTo(3413.33 / 6, 0);
		const edge = reframeParams({ aspect: 16 / 9, frame, x: 0 });
		expect(edge.positionX).toBeCloseTo((3413.33 - 1080) / 2, 0);
	});

	test("only the suggested range is changed", () => {
		const video = {
			id: "v",
			type: "video",
			mediaId: "m",
			name: "v",
			startTime: 0,
			duration: 10_000,
			trimStart: 0,
			trimEnd: 0,
			params: {},
		} as unknown as TimelineElement;
		const tracks = {
			main: { id: "main", type: "video", name: "Main", muted: false, hidden: false, elements: [video] },
			overlay: [],
			audio: [],
		} as unknown as SceneTracks;
		let n = 0;
		const next = applyReframe({
			tracks,
			start: 2_000,
			end: 5_000,
			x: 0.25,
			frame: { width: 1080, height: 1920 },
			aspectOf: () => 16 / 9,
			makeId: () => `n${n++}`,
		});
		const pieces = next.main.elements;
		expect(pieces.map((p) => [p.startTime, p.duration, p.trimStart, p.trimEnd])).toEqual([
			[0, 2_000, 0, 8_000],
			[2_000, 3_000, 2_000, 5_000],
			[5_000, 5_000, 5_000, 0],
		]);
		expect(pieces[0]!.params["transform.positionX"]).toBeUndefined();
		expect(pieces[1]!.params["transform.positionX"]).toBeGreaterThan(0);
	});
});
