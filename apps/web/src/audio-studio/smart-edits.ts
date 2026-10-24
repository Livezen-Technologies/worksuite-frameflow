import type { Transcript } from "@/transcript/types";

/** Filler words removed by default (AE-03), English, Sinhala and Tamil. */
export const DEFAULT_FILLERS = ["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mm", "mhm", "ම්", "අ", "ආ", "හ්ම්", "ம்", "அ", "ஆ"];

const clean = (word: string) => word.toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, "").trim();

/**
 * Where filler words are, as timeline ranges (seconds), padded a little
 * and merged when they touch. Needs word timings from the transcript.
 */
export function fillerRanges({
	transcript,
	fillers = DEFAULT_FILLERS,
	pad = 0.03,
}: {
	transcript: Transcript;
	fillers?: string[];
	pad?: number;
}): { start: number; end: number; word: string }[] {
	const wanted = new Set(fillers.map(clean).filter(Boolean));
	const found: { start: number; end: number; word: string }[] = [];
	for (const segment of transcript.segments) {
		for (const word of segment.words ?? []) {
			if (wanted.has(clean(word.text)) && word.end > word.start) {
				found.push({ start: Math.max(0, word.start - pad), end: word.end + pad, word: word.text });
			}
		}
	}
	found.sort((a, b) => a.start - b.start);
	const merged: typeof found = [];
	for (const range of found) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
		else merged.push({ ...range });
	}
	return merged;
}

/**
 * Speech intervals from a loudness envelope (one RMS value per `hop`
 * seconds): above the threshold counts as speech; gaps shorter than
 * `hold` are bridged so the music doesn't pump between words.
 */
export function speechIntervals({
	rms,
	hop,
	offset = 0,
	threshold,
	hold = 0.35,
	minLength = 0.15,
}: {
	rms: ArrayLike<number>;
	hop: number;
	offset?: number;
	threshold: number;
	hold?: number;
	minLength?: number;
}): { start: number; end: number }[] {
	const out: { start: number; end: number }[] = [];
	let start = -1;
	let lastLoud = -1;
	for (let i = 0; i < rms.length; i++) {
		const loud = rms[i]! >= threshold;
		if (loud) {
			if (start < 0) start = i;
			lastLoud = i;
		} else if (start >= 0 && (i - lastLoud) * hop > hold) {
			out.push({ start: offset + start * hop, end: offset + (lastLoud + 1) * hop });
			start = -1;
		}
	}
	if (start >= 0) out.push({ start: offset + start * hop, end: offset + (lastLoud + 1) * hop });
	const ms = (n: number) => Math.round(n * 1000) / 1000;
	return out.filter((r) => r.end - r.start >= minLength).map((r) => ({ start: ms(r.start), end: ms(r.end) }));
}

/** Joins intervals that overlap or sit closer than `gap` seconds. */
export function mergeIntervals({ intervals, gap = 0 }: { intervals: { start: number; end: number }[]; gap?: number }) {
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	const out: { start: number; end: number }[] = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (last && r.start - last.end <= gap) last.end = Math.max(last.end, r.end);
		else out.push({ ...r });
	}
	return out;
}

/**
 * Volume keyframes (clip-local seconds, dB) that duck a music clip under
 * speech (AE-06): down to base − depth over `attack` before each phrase,
 * back up over `release` after it.
 */
export function duckKeyframes({
	speech,
	clipStart,
	clipDuration,
	base,
	depth,
	attack = 0.15,
	release = 0.5,
}: {
	speech: { start: number; end: number }[];
	clipStart: number;
	clipDuration: number;
	base: number;
	depth: number;
	attack?: number;
	release?: number;
}): { time: number; value: number }[] {
	const low = base - Math.abs(depth);
	// Phrases closer than the time to come back up stay ducked between them.
	const phrases = mergeIntervals({ intervals: speech, gap: attack + release });
	const keys: { time: number; value: number }[] = [];
	for (const p of phrases) {
		const s = p.start - clipStart;
		const e = p.end - clipStart;
		if (e <= 0 || s >= clipDuration) continue;
		const down = Math.max(0, s - attack);
		if (down > 0) keys.push({ time: down, value: base });
		keys.push({ time: Math.max(0, s), value: low });
		keys.push({ time: Math.min(clipDuration, e), value: low });
		if (e + release < clipDuration) keys.push({ time: e + release, value: base });
	}
	return keys;
}
