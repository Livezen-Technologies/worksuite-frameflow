"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useTranslationMemory } from "@/ai/memory-store";
import type { Transcript } from "./types";

interface TranscriptStore {
	/** One transcript per project, kept on this device. */
	byProject: Record<string, Transcript>;
	/** Project whose transcript editor is open, if any. */
	openProjectId: string | null;
	setTranscript: (args: { projectId: string; transcript: Transcript }) => void;
	removeTranscript: (args: { projectId: string }) => void;
	/** A transcription running now: lines appear as they're found. */
	live: { projectId: string; step: string } | null;
	setLive: (live: { projectId: string; step: string } | null) => void;
	openEditor: (args: { projectId: string }) => void;
	closeEditor: () => void;
}

export const useTranscriptStore = create<TranscriptStore>()(
	persist(
		(set) => ({
			byProject: {},
			openProjectId: null,
			live: null,
			setLive: (live) => set({ live }),
			setTranscript: ({ projectId, transcript }) => {
				// Corrected translations go into translation memory (AI-37).
				useTranslationMemory.getState().remember({ projectId, transcript });
				set((state) => ({
					byProject: { ...state.byProject, [projectId]: transcript },
				}));
			},
			removeTranscript: ({ projectId }) =>
				set((state) => {
					const { [projectId]: _removed, ...rest } = state.byProject;
					return { byProject: rest };
				}),
			openEditor: ({ projectId }) => set({ openProjectId: projectId }),
			closeEditor: () => set({ openProjectId: null }),
		}),
		{
			name: "frameflow-transcripts",
			partialize: (state) => ({ byProject: state.byProject }),
		},
	),
);
