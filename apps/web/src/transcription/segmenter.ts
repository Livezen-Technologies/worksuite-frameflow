/**
 * Splits speech audio into short pieces at natural pauses before Whisper
 * sees it, and cleans what comes back. Whisper on a whole video drifts:
 * timestamps collapse to 00:00, long silences turn into repeated words,
 * and Sinhala characters get cut in half at its fixed 30 s windows.
 * Transcribing 5–15 s pieces that start and end in silence avoids all of
 * that, and each piece's timestamps come from its own place in the audio.
 */

export const SAMPLE_RATE = 16_000;
const FRAME_S = 0.03;

export interface Region {
	start: number;
	end: number;
}

/** Energy per 30 ms frame (RMS). */
function frameEnergies(audio: Float32Array): Float32Array {
	const size = Math.round(SAMPLE_RATE * FRAME_S);
	const frames = new Float32Array(Math.floor(audio.length / size));
	for (let f = 0; f < frames.length; f++) {
		let sum = 0;
		for (let i = f * size; i < (f + 1) * size; i++) sum += audio[i] * audio[i];
		frames[f] = Math.sqrt(sum / size);
	}
	return frames;
}

/**
 * Voice activity: frames well above the recording's own noise floor, with
 * short gaps bridged so words in one phrase stay together.
 */
export function speechRegions({ audio, minGap = 0.35, minSpeech = 0.25 }: { audio: Float32Array; minGap?: number; minSpeech?: number }): Region[] {
	const energies = frameEnergies(audio);
	if (!energies.length) return [];
	const sorted = [...energies].sort((a, b) => a - b);
	const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
	const peak = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
	// Between the noise floor and typical speech level; never below a hard minimum.
	const threshold = Math.max(0.004, floor + (peak - floor) * 0.12);
	const regions: Region[] = [];
	let start = -1;
	let lastVoiced = -1;
	for (let f = 0; f < energies.length; f++) {
		if (energies[f] >= threshold) {
			if (start < 0) start = f;
			lastVoiced = f;
		} else if (start >= 0 && (f - lastVoiced) * FRAME_S > minGap) {
			regions.push({ start: start * FRAME_S, end: (lastVoiced + 1) * FRAME_S });
			start = -1;
		}
	}
	if (start >= 0) regions.push({ start: start * FRAME_S, end: (lastVoiced + 1) * FRAME_S });
	return regions.filter((r) => r.end - r.start >= minSpeech);
}

/** The quietest moment between `from` and `to` (seconds), to cut a long phrase without splitting a word. */
function quietestPoint({ audio, from, to }: { audio: Float32Array; from: number; to: number }): number {
	const size = Math.round(SAMPLE_RATE * FRAME_S);
	let best = to;
	let bestEnergy = Number.POSITIVE_INFINITY;
	for (let t = from; t < to; t += FRAME_S) {
		const i0 = Math.floor(t * SAMPLE_RATE);
		let sum = 0;
		for (let i = i0; i < i0 + size && i < audio.length; i++) sum += audio[i] * audio[i];
		if (sum < bestEnergy) {
			bestEnergy = sum;
			best = t;
		}
	}
	return best;
}

/**
 * Groups speech into pieces of about `target` seconds (never over `max`),
 * cutting at pauses; a phrase longer than `max` is cut at its quietest point.
 */
export function planChunks({
	audio,
	regions,
	target = 10,
	min = 5,
	max = 15,
	pad = 0.25,
}: {
	audio: Float32Array;
	regions: Region[];
	target?: number;
	min?: number;
	max?: number;
	pad?: number;
}): Region[] {
	const duration = audio.length / SAMPLE_RATE;
	// Split phrases longer than max first.
	const pieces: Region[] = [];
	for (const r of regions) {
		let s = r.start;
		while (r.end - s > max) {
			const cut = quietestPoint({ audio, from: s + min, to: s + max });
			pieces.push({ start: s, end: cut });
			s = cut;
		}
		pieces.push({ start: s, end: r.end });
	}
	const chunks: Region[] = [];
	let current: Region | null = null;
	for (const p of pieces) {
		if (!current) current = { ...p };
		else if (p.end - current.start <= max && current.end - current.start < target) current.end = p.end;
		else {
			chunks.push(current);
			current = { ...p };
		}
	}
	if (current) chunks.push(current);
	return chunks.map((c) => ({ start: Math.max(0, c.start - pad), end: Math.min(duration, c.end + pad) }));
}

/**
 * Tidies recognised text without changing what was said: Unicode NFC, no
 * replacement characters or stray control codes, and runs of the same word
 * or phrase (a Whisper loop) cut back to one. Zero-width joiners stay —
 * Sinhala needs them for conjunct letters.
 */
export function cleanText(text: string): string {
	let t = text
		.normalize("NFC")
		.replace(/�+/g, "")
		// eslint-disable-next-line no-control-regex -- stripping control codes is the point
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
		.replace(/[ \t]+/g, " ")
		.trim();
	// Phrases of 1–6 words repeated 3+ times in a row → once.
	for (let n = 6; n >= 1; n--) {
		const words = t.split(" ");
		const out: string[] = [];
		for (let i = 0; i < words.length; ) {
			const unit = words.slice(i, i + n).join(" ");
			let repeats = 1;
			while (unit && words.slice(i + repeats * n, i + (repeats + 1) * n).join(" ") === unit) repeats++;
			if (repeats >= 3) {
				out.push(...words.slice(i, i + n));
				i += repeats * n;
			} else {
				out.push(words[i]);
				i++;
			}
		}
		t = out.join(" ");
	}
	return t.trim();
}

/**
 * A piece Whisper made up rather than heard: far too many characters for
 * its length, or the same few characters over and over.
 */
export function looksHallucinated({ text, seconds }: { text: string; seconds: number }): boolean {
	const chars = [...text.replace(/\s/g, "")];
	if (!chars.length) return true;
	if (seconds > 0 && chars.length / seconds > 40) return true;
	const distinct = new Set(chars).size;
	return chars.length > 30 && distinct / chars.length < 0.08;
}
