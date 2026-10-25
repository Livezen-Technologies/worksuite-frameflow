import type { LanguageCode } from "./languages";

export type TranscriptionLanguage = LanguageCode | "auto";

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
	/** Word timings when the engine gives them (AI-46). */
	words?: { text: string; start: number; end: number }[];
	/** 0–1, from checks on the text (see estimateConfidence). */
	confidence?: number;
	/** The piece of audio (seconds) this line came from. */
	piece?: { start: number; end: number };
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
	language: string;
}

export type TranscriptionStatus =
	| "idle"
	| "loading-model"
	| "transcribing"
	| "complete"
	| "error";

export interface TranscriptionProgress {
	status: TranscriptionStatus;
	progress: number;
	message?: string;
}

export type TranscriptionModelId =
	| "whisper-tiny"
	| "whisper-small"
	| "whisper-medium"
	| "whisper-large-v3-turbo"
	| "whisper-small-si";

export interface TranscriptionModel {
	id: TranscriptionModelId;
	name: string;
	huggingFaceId: string;
	description: string;
	/** Only for this language (used automatically for it). */
	language?: string;
	/**
	 * ONNX files published as a GitHub release (flattened "onnx__x.onnx"),
	 * for fine-tunes that only ship PyTorch weights on Hugging Face.
	 */
	release?: { repo: string; tag: string };
}

export interface CaptionChunk {
	text: string;
	startTime: number;
	duration: number;
	/** Word timings in timeline seconds (AI-46). */
	words?: { text: string; start: number; end: number }[];
}
