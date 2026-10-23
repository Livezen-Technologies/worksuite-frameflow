import type { TranscriptSegment } from "@/transcript/types";
import type { AiRequest } from "@/ai/provider";
import type { PlatformLimit } from "./platforms";
import type { Suggestion } from "./store";

const SUGGESTION_SCHEMA = {
	type: "OBJECT",
	properties: {
		suggestions: {
			type: "ARRAY",
			items: {
				type: "OBJECT",
				properties: {
					kind: { type: "STRING" },
					start: { type: "NUMBER" },
					end: { type: "NUMBER" },
					title: { type: "STRING" },
					reason: { type: "STRING" },
					confidence: { type: "NUMBER" },
					layout: { type: "STRING" },
					captionStyle: { type: "STRING" },
					x: { type: "NUMBER" },
					y: { type: "NUMBER" },
				},
				required: ["kind", "start", "end", "confidence"],
			},
		},
	},
	required: ["suggestions"],
};

/**
 * Clip suggestions from the transcript (SRS AI-53). The wording asks for
 * moments that stand on their own; it never asks the model to predict
 * views or "virality" (AI-54).
 */
export function buildClipRequest({
	segments,
	platform,
}: {
	segments: TranscriptSegment[];
	platform: PlatformLimit;
}): AiRequest {
	return {
		system:
			"You help a video editor find short clips in a longer video. " +
			`Pick moments that make sense on their own, between ${platform.minSeconds} and ${platform.maxSeconds} seconds, for ${platform.name}. ` +
			"Start and end on the given segment times. For each, give a short title, the reason it stands alone, " +
			`layout "${platform.vertical ? "vertical" : "landscape"}", a captionStyle ("word highlight", "word by word" or "plain"), ` +
			'kind "clip", and confidence 0–1 for how well it stands alone. ' +
			"Do not predict views, reach or performance, and do not call anything viral. At most 10 clips.",
		text: JSON.stringify(
			segments.map((s) => ({ start: Number(s.start.toFixed(2)), end: Number(s.end.toFixed(2)), text: s.text })),
		),
		schema: SUGGESTION_SCHEMA,
	};
}

/** Where the main subject is in sampled frames, for vertical crops (AI-53). */
export function buildReframeRequest({ times }: { times: number[] }): AiRequest {
	return {
		system:
			"These are frames from one video, in order. For each frame, find the main subject " +
			"(the speaker, or what the viewer should watch) so a vertical 9:16 crop can follow it. " +
			'Return one suggestion per frame: kind "reframe", start and end set to the frame\'s time, ' +
			"x and y of the subject's centre as 0–1 of the frame width and height, and confidence 0–1.",
		text: `Frame times in seconds, in order: ${times.map((t) => t.toFixed(2)).join(", ")}`,
		schema: SUGGESTION_SCHEMA,
	};
}

/**
 * Cleans clip suggestions: snaps to segment edges, keeps them within the
 * platform's limits, drops near-duplicates, best first.
 */
export function normalizeClips({
	items,
	segments,
	platform,
	makeId,
}: {
	items: Omit<Suggestion, "id" | "status">[];
	segments: TranscriptSegment[];
	platform: PlatformLimit;
	makeId: () => string;
}): Suggestion[] {
	const starts = segments.map((s) => s.start);
	const ends = segments.map((s) => s.end);
	const nearest = ({ value, list }: { value: number; list: number[] }) =>
		list.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), list[0] ?? value);
	const out: Suggestion[] = [];
	for (const item of [...items].sort((a, b) => b.confidence - a.confidence)) {
		if (item.kind !== "clip") continue;
		const start = nearest({ value: item.start, list: starts });
		let end = nearest({ value: item.end, list: ends });
		if (end - start > platform.maxSeconds) {
			// Trim to the last segment end that still fits.
			const fitting = ends.filter((e) => e > start && e - start <= platform.maxSeconds);
			end = fitting.length ? Math.max(...fitting) : start + platform.maxSeconds;
		}
		if (end - start < platform.minSeconds) continue;
		const overlapsBetter = out.some(
			(o) => Math.min(o.end, end) - Math.max(o.start, start) > 0.5 * (end - start),
		);
		if (overlapsBetter) continue;
		out.push({
			...item,
			id: makeId(),
			start,
			end,
			layout: item.layout ?? (platform.vertical ? "vertical" : "landscape"),
			status: "pending",
		});
		if (out.length >= 10) break;
	}
	return out.sort((a, b) => a.start - b.start);
}

/** Joins per-frame subject positions into reframe ranges that hold still. */
export function reframeRanges({
	frames,
	makeId,
	duration,
}: {
	frames: { time: number; x: number; y: number; confidence: number }[];
	makeId: () => string;
	duration: number;
}): Suggestion[] {
	const sorted = [...frames].sort((a, b) => a.time - b.time);
	const out: Suggestion[] = [];
	for (let i = 0; i < sorted.length; i++) {
		const frame = sorted[i]!;
		const end = sorted[i + 1]?.time ?? duration;
		const last = out[out.length - 1];
		if (last && Math.abs((last.x ?? 0.5) - frame.x) < 0.08) {
			last.end = end;
			last.confidence = Math.min(last.confidence, frame.confidence);
			continue;
		}
		out.push({
			id: makeId(),
			kind: "reframe",
			start: frame.time,
			end,
			x: frame.x,
			y: frame.y,
			confidence: frame.confidence,
			status: "pending",
		});
	}
	return out;
}
