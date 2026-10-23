import type { TimedWord } from "@/captions/words";
/** Language tag per segment; "mixed" = Sinhala sentence with English words. */
export type ScriptLanguage = "si" | "en" | "mixed" | "other";

export interface TranscriptSegment {
	id: string;
	/** Seconds from the start of the timeline. */
	start: number;
	end: number;
	text: string;
	lang: ScriptLanguage;
	verified: boolean;
	/** Word timings in timeline seconds (AI-46); re-aligned if the text changes. */
	words?: TimedWord[];
	/** Set by AI translation: what it was translated from and to (AI-37). */
	translation?: { source: string; machine: string; target: string };
}

export interface Transcript {
	version: 1;
	/** Language Whisper was asked for ("auto" when detected). */
	language: string;
	engine: string;
	createdAt: number;
	segments: TranscriptSegment[];
	/** Track the narration was taken from (AI-44); null = all audio. */
	narrationTrackId?: string | null;
}
