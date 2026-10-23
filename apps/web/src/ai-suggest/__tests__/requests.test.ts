import { describe, expect, test } from "bun:test";
import type { TranscriptSegment } from "@/transcript/types";
import { buildClipRequest, normalizeClips, reframeRanges } from "../requests";

const seg = ({ start, end, text = "x" }: { start: number; end: number; text?: string }): TranscriptSegment => ({
	id: `s${start}`,
	start,
	end,
	text,
	lang: "en",
	verified: true,
});
const segments = [seg({ start: 0, end: 10 }), seg({ start: 10, end: 25 }), seg({ start: 25, end: 50 }), seg({ start: 50, end: 80 }), seg({ start: 80, end: 140 })];
const platform = { id: "shorts", name: "YouTube Shorts", maxSeconds: 60, minSeconds: 15, vertical: true };
let n = 0;
const makeId = () => `id${n++}`;

describe("AI clip suggestions", () => {
	test("snap to segments, fit the platform, drop duplicates", () => {
		const clips = normalizeClips({
			items: [
				{ kind: "clip", start: 9.4, end: 49, confidence: 0.9, title: "A" },
				{ kind: "clip", start: 11, end: 48, confidence: 0.5, title: "A again" },
				{ kind: "clip", start: 49, end: 139, confidence: 0.7, title: "Too long" },
				{ kind: "clip", start: 0, end: 9, confidence: 0.95, title: "Too short" },
			],
			segments,
			platform,
			makeId,
		});
		expect(clips.map((c) => c.title)).toEqual(["A", "Too long"]);
		expect(clips[0]).toMatchObject({ start: 10, end: 50, layout: "vertical", status: "pending" });
		// 50 → 140 is 90 s: trimmed back to the last segment end within 60 s.
		expect(clips[1]).toMatchObject({ start: 50, end: 80 });
	});

	test("the prompt never asks about virality or views", () => {
		const request = buildClipRequest({ segments, platform });
		expect(request.system).toContain("Do not predict views");
		expect(request.system).toContain("between 15 and 60 seconds");
	});

	test("reframe frames join into steady ranges", () => {
		const ranges = reframeRanges({
			frames: [
				{ time: 0, x: 0.3, y: 0.5, confidence: 0.9 },
				{ time: 2, x: 0.33, y: 0.5, confidence: 0.8 },
				{ time: 4, x: 0.7, y: 0.4, confidence: 0.85 },
			],
			makeId,
			duration: 6,
		});
		expect(ranges).toHaveLength(2);
		expect(ranges[0]).toMatchObject({ start: 0, end: 4, x: 0.3, confidence: 0.8 });
		expect(ranges[1]).toMatchObject({ start: 4, end: 6, x: 0.7 });
	});
});

describe("suggestion answers", () => {
	test("keep layout and caption style, reject unknown styles", async () => {
		const { SuggestionItem } = await import("@/ai/schemas");
		expect(
			SuggestionItem.parse({ kind: "clip", start: 0, end: 5, confidence: 0.8, layout: "vertical", captionStyle: "word highlight" }),
		).toMatchObject({ layout: "vertical", captionStyle: "word highlight" });
		expect(SuggestionItem.safeParse({ kind: "clip", start: 0, end: 5, confidence: 0.8, captionStyle: "sparkly" }).success).toBe(false);
		expect(SuggestionItem.safeParse({ kind: "clip", start: 0, end: 5, confidence: 1.5 }).success).toBe(false);
	});
});
