/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- partial timeline fixtures */
import { describe, expect, test } from "bun:test";
import type { SceneTracks, TimelineElement } from "@/timeline/types";
import { applyKeepRanges, duckChannel } from "../timeline";

const T = 1000;
const audio = (over: Record<string, unknown>) =>
	({
		id: "a",
		type: "audio",
		sourceType: "upload",
		mediaId: "m",
		name: "vo",
		startTime: 0,
		duration: 8 * T,
		trimStart: 0,
		trimEnd: 0,
		params: {},
		...over,
	}) as unknown as TimelineElement;
const tracks = (elements: TimelineElement[]) =>
	({
		main: {
			id: "main",
			type: "video",
			name: "Main",
			muted: false,
			hidden: false,
			elements: [],
		},
		overlay: [],
		audio: [{ id: "vo", type: "audio", name: "VO", muted: false, elements }],
	}) as unknown as SceneTracks;

describe("audio tools on the timeline", () => {
	test("silence trim keeps ranges back to back and pulls later clips in", () => {
		let n = 0;
		const next = applyKeepRanges({
			tracks: tracks([
				audio({}),
				audio({ id: "b", startTime: 9 * T, duration: 2 * T }),
			]),
			trackId: "vo",
			elementId: "a",
			keep: [
				[1, 3.5],
				[5.8, 7.2],
			],
			ticksPerSecond: T,
			makeId: () => `n${n++}`,
		});
		const els = next.audio[0]!.elements;
		expect(
			els.map((e) => [
				e.id,
				Number(e.startTime),
				Number(e.duration),
				Number(e.trimStart),
			]),
		).toEqual([
			["a", 0, 2500, 1000],
			["n0", 2500, 1400, 5800],
			["b", 4900, 2000, 0],
		]);
	});

	test("ducking keys sit on the clip's own volume", () => {
		const channel = duckChannel({
			element: audio({ startTime: 2 * T, duration: 6 * T }),
			keys: [
				{ time: 0.7, db: 0 },
				{ time: 1, db: -12 },
				{ time: 3.4, db: -12 },
				{ time: 3.7, db: 0 },
			],
			baseDb: -3,
			ticksPerSecond: T,
			makeId: () => "k",
		});
		expect(channel!.keys.map((k) => [k.time, k.value])).toEqual([
			[0, -15],
			[1400, -15],
			[1700, -3],
		]);
	});
});
