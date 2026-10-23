"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TranscribeEngine = "local" | "gemini";

interface AiSettings {
	/** Empty = the desktop app's default Gemini model. */
	model: string;
	/** Names and terms to spell right (SRS AI-04). */
	vocabulary: string[];
	transcribeEngine: TranscribeEngine;
	setModel: (model: string) => void;
	setVocabulary: (vocabulary: string[]) => void;
	setTranscribeEngine: (engine: TranscribeEngine) => void;
}

export const useAiSettings = create<AiSettings>()(
	persist(
		(set) => ({
			model: "",
			vocabulary: [],
			transcribeEngine: "local",
			setModel: (model) => set({ model: model.trim() }),
			setVocabulary: (vocabulary) =>
				set({
					vocabulary: [
						...new Set(vocabulary.map((w) => w.trim()).filter(Boolean)),
					].slice(0, 500),
				}),
			setTranscribeEngine: (transcribeEngine) => set({ transcribeEngine }),
		}),
		{ name: "frameflow-ai" },
	),
);
