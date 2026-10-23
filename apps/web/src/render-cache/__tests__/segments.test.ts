import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline/types";
import { segmentAt, segmentFingerprint, segmentsFor } from "../segments";

const T = 1000; // ticks per second in these fixtures

function tracks({
	a,
	b,
}: {
	a: { start: number; opacity: number };
	b: { start: number };
}): SceneTracks {
	const clip = ({
		id,
		start,
		params = {},
	}: {
		id: string;
		start: number;
		params?: object;
	}) => ({
		id,
		type: "text",
		name: id,
		startTime: start * T,
		duration: 1 * T,
		trimStart: 0,
		trimEnd: 0,
		params,
	});
	// Only the fields the fingerprint reads matter here.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return {
		main: {
			id: "main",
			type: "video",
			elements: [
				clip({ id: "a", start: a.start, params: { opacity: a.opacity } }),
			],
		},
		overlay: [
			{
				id: "o",
				type: "text",
				hidden: false,
				elements: [clip({ id: "b", start: b.start })],
			},
		],
		audio: [],
	} as unknown as SceneTracks;
}

const settings = {
	canvasSize: { width: 1920, height: 1080 },
	background: { type: "color" as const, color: "#000" },
	fps: { numerator: 30, denominator: 1 },
};

const fp = ({
	t,
	start,
	end,
}: {
	t: SceneTracks;
	start: number;
	end: number;
}) =>
	segmentFingerprint({
		tracks: t,
		settings,
		startTicks: start * T,
		endTicks: end * T,
	});

describe("render cache segments", () => {
	test("timeline is cut into 2-second segments", () => {
		const segs = segmentsFor({ totalFrames: 150, fps: 30 });
		expect(segs.map((s) => [s.startFrame, s.endFrame])).toEqual([
			[0, 60],
			[60, 120],
			[120, 150],
		]);
		expect(segmentAt({ frame: 59, fps: 30 })).toBe(0);
		expect(segmentAt({ frame: 60, fps: 30 })).toBe(1);
	});

	test("an edit only invalidates the segments it touches", () => {
		const before = tracks({ a: { start: 0, opacity: 1 }, b: { start: 5 } });
		const after = tracks({ a: { start: 0, opacity: 0.5 }, b: { start: 5 } });
		// Clip a (0–1 s) changed: first segment is stale, the one with clip b isn't.
		expect(fp({ t: before, start: 0, end: 2 })).not.toBe(
			fp({ t: after, start: 0, end: 2 }),
		);
		expect(fp({ t: before, start: 4, end: 6 })).toBe(
			fp({ t: after, start: 4, end: 6 }),
		);
	});

	test("moving a clip into a segment invalidates it", () => {
		const before = tracks({ a: { start: 0, opacity: 1 }, b: { start: 5 } });
		const moved = tracks({ a: { start: 0, opacity: 1 }, b: { start: 2.5 } });
		expect(fp({ t: before, start: 2, end: 4 })).not.toBe(
			fp({ t: moved, start: 2, end: 4 }),
		);
	});

	test("project picture settings invalidate everything; extra keys too", () => {
		const t = tracks({ a: { start: 0, opacity: 1 }, b: { start: 5 } });
		const base = fp({ t, start: 4, end: 6 });
		const other = segmentFingerprint({
			tracks: t,
			settings: { ...settings, background: { type: "color", color: "#fff" } },
			startTicks: 4 * T,
			endTicks: 6 * T,
		});
		expect(other).not.toBe(base);
		expect(
			segmentFingerprint({
				tracks: t,
				settings,
				startTicks: 4 * T,
				endTicks: 6 * T,
				extra: "q0.5",
			}),
		).not.toBe(base);
	});

	test("a new track elsewhere leaves this segment cached", () => {
		const t = tracks({ a: { start: 0, opacity: 1 }, b: { start: 5 } });
		// Fixture shaped like the scene; see tracks() above.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const withTrack = {
			...t,
			overlay: [
				{
					id: "new",
					type: "text",
					hidden: false,
					elements: [
						{ ...t.overlay[0].elements[0], id: "c", startTime: 4.2 * T },
					],
				},
				...t.overlay,
			],
		} as SceneTracks;
		expect(fp({ t: withTrack, start: 0, end: 2 })).toBe(
			fp({ t, start: 0, end: 2 }),
		);
		expect(fp({ t: withTrack, start: 4, end: 6 })).not.toBe(
			fp({ t, start: 4, end: 6 }),
		);
	});
});
