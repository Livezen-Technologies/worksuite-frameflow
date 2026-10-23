"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Transcript } from "@/transcript/types";
import { correctionsIn, mergeEntries, type MemoryEntry } from "./translation-memory";

interface TranslationMemory {
	entries: MemoryEntry[];
	remember: (args: { projectId: string; transcript: Transcript }) => void;
	clear: () => void;
}

export const useTranslationMemory = create<TranslationMemory>()(
	persist(
		(set, get) => ({
			entries: [],
			remember: ({ projectId, transcript }) => {
				const entries = mergeEntries({
					entries: get().entries,
					added: correctionsIn({ transcript, projectId }),
				});
				if (entries !== get().entries) set({ entries });
			},
			clear: () => set({ entries: [] }),
		}),
		{ name: "frameflow-translation-memory" },
	),
);
