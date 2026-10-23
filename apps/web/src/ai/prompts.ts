import type { Transcript, TranscriptSegment } from "@/transcript/types";
import type { TranscriptionSegment } from "@/transcription/types";
import { LANGUAGES } from "@/transcription/languages";

/**
 * Prompts and response handling for the Gemini features. Everything here
 * is pure: requests in, checked results out, so a bad or partial answer
 * can never scramble a transcript (unknown ids and empty text are ignored,
 * timings always come from the transcript, not the model).
 */

export const BATCH_SIZE = 60;

export function languageName(code: string): string {
	const found = LANGUAGES.find((l) => l.code === code);
	return found ? found.name.replace(/\s*\(.*\)$/, "") : code;
}

function vocabularyLine(vocabulary: string[]): string {
	return vocabulary.length
		? `\nSpell these names and terms exactly like this: ${vocabulary.join(", ")}.`
		: "";
}

const TEXT_RESULT_SCHEMA = {
	type: "OBJECT",
	properties: {
		segments: {
			type: "ARRAY",
			items: {
				type: "OBJECT",
				properties: { id: { type: "STRING" }, text: { type: "STRING" } },
				required: ["id", "text"],
			},
		},
	},
	required: ["segments"],
};

export interface TextRequest {
	system: string;
	text: string;
	schema: object;
}

function segmentPayload(segments: TranscriptSegment[]) {
	return JSON.stringify(segments.map(({ id, text }) => ({ id, text })));
}

export function buildTranslateRequest({
	segments,
	target,
	vocabulary,
}: {
	segments: TranscriptSegment[];
	target: string;
	vocabulary: string[];
}): TextRequest {
	return {
		system:
			`You translate video subtitles into ${languageName(target)}. ` +
			"Translate each segment on its own, keep its id, and keep it about as long as the original so it fits the same time on screen. " +
			"Use natural, everyday wording, not a word-for-word translation. Keep names, numbers and on-screen terms. " +
			"Never merge, split, drop or add segments." +
			vocabularyLine(vocabulary),
		text: segmentPayload(segments),
		schema: TEXT_RESULT_SCHEMA,
	};
}

export function buildCleanupRequest({
	segments,
	language,
	removeFillers,
	vocabulary,
}: {
	segments: TranscriptSegment[];
	language: string;
	removeFillers: boolean;
	vocabulary: string[];
}): TextRequest {
	const lang =
		language === "auto"
			? "the language it is written in"
			: languageName(language);
	return {
		system:
			`You correct automatic speech-recognition subtitles in ${lang}. ` +
			"Fix spelling, punctuation, capitalisation and words the recogniser obviously misheard. " +
			(removeFillers
				? "Remove filler words (um, uh, like, you know) and stutters. "
				: "Keep filler words. ") +
			"Do not rephrase, summarise or translate. Keep each segment's id; never merge, split, drop or add segments. " +
			"Keep Sinhala and Tamil in their own scripts; keep English words that the speaker said in English." +
			vocabularyLine(vocabulary),
		text: segmentPayload(segments),
		schema: TEXT_RESULT_SCHEMA,
	};
}

export function batches<T>({
	items,
	size = BATCH_SIZE,
}: {
	items: T[];
	size?: number;
}): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size)
		out.push(items.slice(i, i + size));
	return out;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		// Some answers wrap the JSON in a code fence.
		const match = text.match(/\{[\s\S]*\}/);
		if (!match) return null;
		try {
			return JSON.parse(match[0]);
		} catch {
			return null;
		}
	}
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

export function parseTextResults(text: string): Map<string, string> {
	const data = parseJson(text);
	const out = new Map<string, string>();
	if (!isRecord(data) || !Array.isArray(data.segments)) return out;
	for (const item of data.segments) {
		if (
			!isRecord(item) ||
			typeof item.id !== "string" ||
			typeof item.text !== "string"
		)
			continue;
		const value = item.text.replace(/\s+/g, " ").trim();
		if (value) out.set(item.id, value);
	}
	return out;
}

/** Apply new text by segment id; changed segments need verifying again. */
export function applyTextResults({
	transcript,
	results,
	language,
	engine,
}: {
	transcript: Transcript;
	results: Map<string, string>;
	language?: string;
	engine?: string;
}): { transcript: Transcript; changed: number } {
	let changed = 0;
	const segments = transcript.segments.map((segment) => {
		const next = results.get(segment.id);
		if (!next || next === segment.text) return segment;
		changed++;
		return { ...segment, text: next, verified: false };
	});
	return {
		transcript: {
			...transcript,
			...(language ? { language } : {}),
			...(engine ? { engine } : {}),
			segments,
		},
		changed,
	};
}

export const TRANSCRIBE_SCHEMA = {
	type: "OBJECT",
	properties: {
		segments: {
			type: "ARRAY",
			items: {
				type: "OBJECT",
				properties: {
					start: { type: "NUMBER" },
					end: { type: "NUMBER" },
					text: { type: "STRING" },
				},
				required: ["start", "end", "text"],
			},
		},
	},
	required: ["segments"],
};

export function buildTranscribeRequest({
	language,
	vocabulary,
	duration,
}: {
	language: string;
	vocabulary: string[];
	duration: number;
}): { system: string; text: string; schema: object } {
	const lang =
		language === "auto"
			? "Write each segment in the language spoken; Sinhala in Sinhala script, Tamil in Tamil script, English in English."
			: `The speech is mostly ${languageName(language)}; write it in that language's own script, keeping English words the speaker says in English.`;
	return {
		system:
			"You transcribe speech for video subtitles. Return segments of one sentence or phrase each, at most about 7 seconds and 80 characters long. " +
			"Times are seconds from the start of this audio clip, with two decimals. Transcribe what is said, word for word; leave out music and silence. " +
			lang +
			vocabularyLine(vocabulary),
		text: `Transcribe this ${duration.toFixed(1)}-second audio clip.`,
		schema: TRANSCRIBE_SCHEMA,
	};
}

/** Chunk-relative segments → timeline segments, clamped and ordered. */
export function parseTranscribeResult({
	text,
	offset,
	duration,
}: {
	text: string;
	offset: number;
	duration: number;
}): TranscriptionSegment[] {
	const data = parseJson(text);
	if (!isRecord(data) || !Array.isArray(data.segments)) return [];
	const out: TranscriptionSegment[] = [];
	for (const item of data.segments) {
		if (!isRecord(item) || typeof item.text !== "string") continue;
		const start = Number(item.start);
		const end = Number(item.end);
		const value = item.text.replace(/\s+/g, " ").trim();
		if (!value || !Number.isFinite(start) || !Number.isFinite(end)) continue;
		const s = Math.min(Math.max(0, start), duration);
		const e = Math.min(Math.max(s + 0.2, end), duration);
		if (e <= s) continue;
		out.push({ text: value, start: offset + s, end: offset + e });
	}
	return out.sort((a, b) => a.start - b.start);
}
