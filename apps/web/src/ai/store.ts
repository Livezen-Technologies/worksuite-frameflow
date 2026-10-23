"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiProviderId } from "./bridge";

export type TranscribeEngine = "local" | "gemini";

interface AiSettings {
	/** Empty = the desktop app's default Gemini model. */
	model: string;
	/** Names and terms to spell right (SRS AI-04). */
	vocabulary: string[];
	transcribeEngine: TranscribeEngine;
	/** Provider for text and frame jobs (AI-51); transcription stays on Gemini. */
	provider: AiProviderId;
	/** Models picked for Claude and OpenAI; empty = the app's default. */
	providerModels: Partial<Record<AiProviderId, string>>;
	setProvider: (provider: AiProviderId) => void;
	setProviderModel: (args: { provider: AiProviderId; model: string }) => void;
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
			provider: "gemini",
			providerModels: {},
			setProvider: (provider) => set({ provider }),
			setProviderModel: ({ provider, model }) =>
				set((s) => ({ providerModels: { ...s.providerModels, [provider]: model.trim() } })),
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
