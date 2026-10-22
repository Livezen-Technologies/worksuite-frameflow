import { describe, expect, test } from "bun:test";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { cutTimeRange } from "../cut-range";

const clip = ({
	id,
	start,
	duration,
	rate,
}: {
	id: string;
	start: number;
	duration: number;
	rate?: number;
}) =>
	({
		id,
		type: "video",
		mediaId: "m",
		name: id,
		startTime: start,
		duration,
		trimStart: 0,
		trimEnd: 0,
		params: {},
		...(rate ? { retime: { rate } } : {}),
	}) as unknown as TimelineElement;

const tracksOf = (elements: TimelineElement[]) =>
	({
		overlay: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			elements,
			muted: false,
			hidden: false,
		},
		audio: [],
	}) as unknown as SceneTracks;

let n = 0;
const makeId = () => `new${n++}`;

describe("cutTimeRange (ED-17)", () => {
	test("removes, trims, splits and shifts", () => {
		const out = cutTimeRange({
			tracks: tracksOf([
				clip({ id: "before", start: 0, duration: 100 }),
				clip({ id: "across", start: 100, duration: 300 }),
				clip({ id: "inside", start: 410, duration: 50 }),
				clip({ id: "after", start: 500, duration: 100 }),
			]),
			start: 200,
			end: 300,
			makeId,
		}).main.elements;
		const byId = Object.fromEntries(out.map((e) => [e.id, e]));
		expect(Number(byId.before.startTime)).toBe(0);
		// "across" 100–400 loses 200–300: left 100–200, right 200–300 (source 200 on).
		expect(Number(byId.across.duration)).toBe(100);
		expect(Number(byId.across.trimEnd)).toBe(200);
		const right = out.find((e) => e.id.startsWith("new"));
		expect(Number(right?.startTime)).toBe(200);
		expect(Number(right?.duration)).toBe(100);
		expect(Number(right?.trimStart)).toBe(200);
		expect(Number(byId.inside.startTime)).toBe(310);
		expect(Number(byId.after.startTime)).toBe(400);
	});

	test("clips that end in the range are trimmed; ones inside go", () => {
		const out = cutTimeRange({
			tracks: tracksOf([
				clip({ id: "a", start: 0, duration: 250 }),
				clip({ id: "b", start: 220, duration: 50 }),
			]),
			start: 200,
			end: 300,
			makeId,
		}).main.elements;
		expect(out.map((e) => e.id)).toEqual(["a"]);
		expect(Number(out[0].duration)).toBe(200);
		expect(Number(out[0].trimEnd)).toBe(50);
	});

	test("speed-changed clips trim in source time", () => {
		const out = cutTimeRange({
			tracks: tracksOf([
				clip({ id: "fast", start: 0, duration: 400, rate: 2 }),
			]),
			start: 0,
			end: 100,
			makeId,
		}).main.elements;
		expect(Number(out[0].startTime)).toBe(0);
		expect(Number(out[0].duration)).toBe(300);
		expect(Number(out[0].trimStart)).toBe(200);
	});
});
