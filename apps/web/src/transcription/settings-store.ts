"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_TRANSCRIPTION_MODEL } from "./models";
import type { TranscriptionModelId } from "./types";

export interface TranscriptionSettings {
	/** Target length of each piece of audio, in seconds (5–15). */
	chunkSeconds: number;
	/** Model for languages without their own fine-tune. */
	modelId: TranscriptionModelId;
	/** Sinhala speech with English words: pieces that come back mostly English are re-run with the English model. */
	mixedSinhalaEnglish: boolean;
}

interface Store extends TranscriptionSettings {
	set: (patch: Partial<TranscriptionSettings>) => void;
}

export const MIN_CHUNK_SECONDS = 5;
export const MAX_CHUNK_SECONDS = 15;

export const useTranscriptionSettings = create<Store>()(
	persist(
		(set) => ({
			chunkSeconds: 10,
			modelId: DEFAULT_TRANSCRIPTION_MODEL,
			mixedSinhalaEnglish: true,
			set: (patch) => set(patch),
		}),
		{ name: "frameflow-transcription-settings" },
	),
);

export function transcriptionSettings(): TranscriptionSettings {
	const { chunkSeconds, modelId, mixedSinhalaEnglish } = useTranscriptionSettings.getState();
	return { chunkSeconds, modelId, mixedSinhalaEnglish };
}
