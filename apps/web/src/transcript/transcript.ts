import type { TimedWord } from "@/captions/words";
import type { TranscriptionSegment } from "@/transcription/types";
import { detectScriptLanguage } from "./script";
import type { Transcript, TranscriptSegment } from "./types";

let idCounter = 0;
export function newSegmentId(): string {
	idCounter += 1;
	return `seg-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function makeSegment({
	start,
	end,
	text,
	verified = false,
	words,
}: {
	start: number;
	end: number;
	text: string;
	verified?: boolean;
	words?: TimedWord[];
}): TranscriptSegment {
	const clean = text.replace(/\s+/g, " ").trim();
	return {
		id: newSegmentId(),
		start,
		end: Math.max(end, start),
		text: clean,
		lang: detectScriptLanguage(clean),
		verified,
		...(words?.length ? { words } : {}),
	};
}

export function createTranscript({
	segments,
	language,
	engine,
	narrationTrackId = null,
}: {
	segments: TranscriptionSegment[];
	language: string;
	engine: string;
	narrationTrackId?: string | null;
}): Transcript {
	return {
		version: 1,
		language,
		engine,
		narrationTrackId,
		createdAt: Date.now(),
		segments: segments
			.map((segment) => makeSegment(segment))
			.filter((segment) => segment.text.length > 0)
			.sort((a, b) => a.start - b.start),
	};
}

function mapSegment({
	transcript,
	id,
	fn,
}: {
	transcript: Transcript;
	id: string;
	fn: (segment: TranscriptSegment) => TranscriptSegment;
}): Transcript {
	return {
		...transcript,
		segments: transcript.segments.map((segment) =>
			segment.id === id ? fn(segment) : segment,
		),
	};
}

export function updateSegmentText({
	transcript,
	id,
	text,
}: {
	transcript: Transcript;
	id: string;
	text: string;
}): Transcript {
	return mapSegment({
		transcript,
		id,
		fn: (segment) => ({
			...segment,
			text,
			lang: detectScriptLanguage(text),
		}),
	});
}

export function setSegmentTimes({
	transcript,
	id,
	start,
	end,
}: {
	transcript: Transcript;
	id: string;
	start: number;
	end: number;
}): Transcript {
	const safeStart = Math.max(0, start);
	return mapSegment({
		transcript,
		id,
		fn: (segment) => ({
			...segment,
			start: safeStart,
			end: Math.max(safeStart, end),
		}),
	});
}

export function toggleVerified({
	transcript,
	id,
}: {
	transcript: Transcript;
	id: string;
}): Transcript {
	return mapSegment({
		transcript,
		id,
		fn: (segment) => ({
			...segment,
			verified: !segment.verified,
		}),
	});
}

export function setAllVerified({
	transcript,
	verified,
}: {
	transcript: Transcript;
	verified: boolean;
}): Transcript {
	return {
		...transcript,
		segments: transcript.segments.map((segment) => ({ ...segment, verified })),
	};
}

/**
 * Splits a segment at a character offset. Time is divided in proportion to
 * the text on each side, never inside a grapheme cluster.
 */
export function splitSegment({
	transcript,
	id,
	offset,
}: {
	transcript: Transcript;
	id: string;
	offset: number;
}): Transcript {
	const index = transcript.segments.findIndex((segment) => segment.id === id);
	if (index < 0) return transcript;
	const segment = transcript.segments[index];
	const cut = snapToGraphemeBoundary({ text: segment.text, offset });
	const left = segment.text.slice(0, cut).trim();
	const right = segment.text.slice(cut).trim();
	if (!left || !right) return transcript;

	const ratio = cut / segment.text.length;
	const middle = segment.start + (segment.end - segment.start) * ratio;
	const segments = [...transcript.segments];
	segments.splice(
		index,
		1,
		makeSegment({ start: segment.start, end: middle, text: left }),
		makeSegment({ start: middle, end: segment.end, text: right }),
	);
	return { ...transcript, segments };
}

export function mergeWithNext({
	transcript,
	id,
}: {
	transcript: Transcript;
	id: string;
}): Transcript {
	const index = transcript.segments.findIndex((segment) => segment.id === id);
	if (index < 0 || index >= transcript.segments.length - 1) return transcript;
	const current = transcript.segments[index];
	const next = transcript.segments[index + 1];
	const segments = [...transcript.segments];
	segments.splice(
		index,
		2,
		makeSegment({
			start: current.start,
			end: next.end,
			text: `${current.text} ${next.text}`,
			verified: current.verified && next.verified,
		}),
	);
	return { ...transcript, segments };
}

export function deleteSegment({
	transcript,
	id,
}: {
	transcript: Transcript;
	id: string;
}): Transcript {
	return {
		...transcript,
		segments: transcript.segments.filter((segment) => segment.id !== id),
	};
}

export function countMatches({
	transcript,
	find,
}: {
	transcript: Transcript;
	find: string;
}): number {
	if (!find) return 0;
	return transcript.segments.reduce(
		(total, segment) => total + segment.text.split(find).length - 1,
		0,
	);
}

/** Literal (not regex) find and replace across every segment. */
export function replaceAll({
	transcript,
	find,
	replace,
}: {
	transcript: Transcript;
	find: string;
	replace: string;
}): Transcript {
	if (!find) return transcript;
	return {
		...transcript,
		segments: transcript.segments.map((segment) => {
			if (!segment.text.includes(find)) return segment;
			const text = segment.text.split(find).join(replace);
			return { ...segment, text, lang: detectScriptLanguage(text) };
		}),
	};
}

export function graphemes(text: string): string[] {
	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** Moves an offset back to the start of the grapheme cluster it falls in. */
export function snapToGraphemeBoundary({
	text,
	offset,
}: {
	text: string;
	offset: number;
}): number {
	let position = 0;
	for (const cluster of graphemes(text)) {
		if (position + cluster.length > offset) return position;
		position += cluster.length;
	}
	return text.length;
}

/**
 * The transcript after [start, end) seconds were cut out of the video:
 * segments inside go, segments after move earlier (ED-17).
 */
export function cutTranscriptRange({
	transcript,
	start,
	end,
}: {
	transcript: Transcript;
	start: number;
	end: number;
}): Transcript {
	const gap = end - start;
	const segments = transcript.segments.flatMap((segment) => {
		if (segment.end <= start) return [segment];
		if (segment.start >= end) {
			return [
				{ ...segment, start: segment.start - gap, end: segment.end - gap },
			];
		}
		if (segment.start >= start && segment.end <= end) return [];
		// Overlaps the cut: keep what's left of it.
		const newStart = segment.start < start ? segment.start : start;
		const newEnd = segment.end > end ? segment.end - gap : start;
		return newEnd > newStart
			? [{ ...segment, start: newStart, end: newEnd }]
			: [];
	});
	return { ...transcript, segments };
}
