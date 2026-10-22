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
}

export interface Transcript {
	version: 1;
	/** Language Whisper was asked for ("auto" when detected). */
	language: string;
	engine: string;
	createdAt: number;
	segments: TranscriptSegment[];
}
