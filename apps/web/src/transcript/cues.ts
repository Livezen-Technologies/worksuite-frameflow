import type { CaptionChunk } from "@/transcription/types";
import { graphemes } from "./transcript";
import type { Transcript } from "./types";

export const MAX_LINE_GRAPHEMES = 42;
export const MAX_LINES_PER_CUE = 2;
export const MIN_CUE_SECONDS = 1;
export const MAX_CUE_SECONDS = 7;

function graphemeLength(text: string): number {
	return graphemes(text).length;
}

/**
 * Packs text into lines of at most `maxGraphemes` user-perceived characters.
 * Breaks between words; a word longer than a line is broken between grapheme
 * clusters, so a Sinhala vowel sign or virama never leaves its base letter.
 */
export function breakLines({
	text,
	maxGraphemes = MAX_LINE_GRAPHEMES,
}: {
	text: string;
	maxGraphemes?: number;
}): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";

	const pushWordPieces = (word: string) => {
		const clusters = graphemes(word);
		for (let i = 0; i < clusters.length; i += maxGraphemes) {
			lines.push(clusters.slice(i, i + maxGraphemes).join(""));
		}
	};

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (graphemeLength(candidate) <= maxGraphemes) {
			current = candidate;
			continue;
		}
		if (current) lines.push(current);
		current = "";
		if (graphemeLength(word) > maxGraphemes) {
			pushWordPieces(word);
			// keep the last piece open so following words can join it
			current = lines.pop() ?? "";
		} else {
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * Turns a transcript into timed subtitle cues: up to 2 lines of 42
 * characters, each on screen 1–7 seconds. Cue times are shared out within a
 * segment by text length, so segment timing from the transcript is kept.
 */
export function buildCuesFromTranscript({
	transcript,
	maxGraphemes = MAX_LINE_GRAPHEMES,
	maxLines = MAX_LINES_PER_CUE,
}: {
	transcript: Transcript;
	maxGraphemes?: number;
	maxLines?: number;
}): CaptionChunk[] {
	const cues: CaptionChunk[] = [];
	const segments = transcript.segments.filter((s) => s.text.trim());

	segments.forEach((segment, index) => {
		const lines = breakLines({ text: segment.text, maxGraphemes });
		const groups: string[] = [];
		for (let i = 0; i < lines.length; i += maxLines) {
			groups.push(lines.slice(i, i + maxLines).join("\n"));
		}
		const weights = groups.map((group) =>
			graphemeLength(group.replace(/\n/g, "")),
		);
		const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
		const segmentDuration = Math.max(0, segment.end - segment.start);
		const nextStart = segments[index + 1]?.start ?? Number.POSITIVE_INFINITY;

		let cursor = segment.start;
		groups.forEach((group, groupIndex) => {
			const share = (segmentDuration * weights[groupIndex]) / totalWeight;
			const isLast = groupIndex === groups.length - 1;
			const startTime = Math.max(
				cursor,
				cues.at(-1) ? cueEnd(cues.at(-1)!) : 0,
			);
			// Stretch short cues to the minimum, but never into the next segment.
			const limit = isLast ? nextStart : segment.end;
			let duration = Math.min(
				Math.max(share, MIN_CUE_SECONDS),
				MAX_CUE_SECONDS,
			);
			duration = Math.max(Math.min(duration, limit - startTime), 0.2);
			cues.push({ text: group, startTime, duration });
			cursor = startTime + Math.max(share, 0);
		});
	});

	return cues;
}

function cueEnd(cue: CaptionChunk): number {
	return cue.startTime + cue.duration;
}
