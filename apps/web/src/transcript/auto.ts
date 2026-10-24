"use client";

import { create } from "zustand";
import type { TranscriptionLanguage } from "@/transcription/types";

/** Projects to transcribe as soon as their media is on the timeline (DL-07). */
export const useAutoTranscribe = create<{
	pending: Record<string, TranscriptionLanguage>;
	request: (args: { projectId: string; language: TranscriptionLanguage }) => void;
	clear: (projectId: string) => void;
}>()((set) => ({
	pending: {},
	request: ({ projectId, language }) => set((s) => ({ pending: { ...s.pending, [projectId]: language } })),
	clear: (projectId) =>
		set((s) => {
			const { [projectId]: _done, ...rest } = s.pending;
			return { pending: rest };
		}),
}));
