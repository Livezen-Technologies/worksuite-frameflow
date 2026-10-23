/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- partial timeline fixtures */
import { describe, expect, test } from "bun:test";
import type { SceneTracks, TextElement, TimelineElement } from "@/timeline/types";
import { anchorFor, placeAnchor, resyncCaptions } from "../anchor";

const S = 1000; // ticks per "second" in these tests

// Minimal fixtures; only the fields the anchor code reads.
const clip = (over: Record<string, unknown>): TimelineElement =>
	({
		id: "v",
		type: "video",
		mediaId: "m",
		name: "v",
		startTime: 0,
		duration: 10 * S,
		trimStart: 0,
		trimEnd: 0,
		params: {},
		...over,
	}) as unknown as TimelineElement;

const caption = (over: Partial<TextElement>): TextElement =>
	({
		id: "c",
		type: "text",
		name: "c",
		startTime: 0,
		duration: 0,
		trimStart: 0,
		trimEnd: 0,
		params: {},
		...over,
	}) as unknown as TextElement;

const tracks = ({ video, captions }: { video: TimelineElement[]; captions: TextElement[] }) =>
	({
		main: { id: "main", type: "video", name: "Main", muted: false, hidden: false, elements: video },
		overlay: [{ id: "cap", type: "text", name: "Captions", hidden: false, elements: captions }],
		audio: [],
	}) as unknown as SceneTracks;

describe("source-anchored captions", () => {
	test("a caption follows its speech through a trim and a move", () => {
		const anchor = anchorFor({
			tracks: tracks({ video: [clip({})], captions: [] }),
			start: 4 * S,
			end: 6 * S,
		});
		expect(anchor).toMatchObject({ mediaId: "m", sourceStart: 4 * S, sourceEnd: 6 * S });
		// Trim 2 s off the front and move the clip to 10 s.
		const edited = tracks({
			video: [clip({ startTime: 10 * S, trimStart: 2 * S, duration: 8 * S })],
			captions: [],
		});
		expect(placeAnchor({ tracks: edited, anchor: anchor! })).toEqual({
			startTime: 12 * S,
			duration: 2 * S,
		});
	});

	test("speed changes scale the caption", () => {
		const anchor = { mediaId: "m", sourceStart: 4 * S, sourceEnd: 6 * S };
		const fast = tracks({ video: [clip({ duration: 5 * S, retime: { rate: 2 } })], captions: [] });
		expect(placeAnchor({ tracks: fast, anchor })).toEqual({ startTime: 2 * S, duration: S });
	});

	test("cut speech hides the caption; moving the caption by hand re-anchors it", () => {
		const anchor = { mediaId: "m", sourceStart: 4 * S, sourceEnd: 6 * S };
		const cut = tracks({
			video: [clip({ duration: 3 * S })],
			captions: [caption({ startTime: 4 * S, duration: 2 * S, captionAnchor: anchor })],
		});
		const first = resyncCaptions({ tracks: cut, previous: new Map() });
		expect(first.updates[0]?.patch).toMatchObject({ hidden: true });

		const whole = tracks({
			video: [clip({})],
			captions: [caption({ startTime: 5 * S, duration: 2 * S, captionAnchor: anchor })],
		});
		// The source is where it was last time, so the user moved the caption.
		const previous = new Map([["c", { startTime: 4 * S, duration: 2 * S }]]);
		const moved = resyncCaptions({ tracks: whole, previous });
		expect(moved.updates[0]?.patch.captionAnchor).toMatchObject({
			sourceStart: 5 * S,
			sourceEnd: 7 * S,
		});
	});
});
