"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Transcript } from "./types";

interface TranscriptStore {
	/** One transcript per project, kept on this device. */
	byProject: Record<string, Transcript>;
	/** Project whose transcript editor is open, if any. */
	openProjectId: string | null;
	setTranscript: (args: { projectId: string; transcript: Transcript }) => void;
	removeTranscript: (args: { projectId: string }) => void;
	openEditor: (args: { projectId: string }) => void;
	closeEditor: () => void;
}

export const useTranscriptStore = create<TranscriptStore>()(
	persist(
		(set) => ({
			byProject: {},
			openProjectId: null,
			setTranscript: ({ projectId, transcript }) =>
				set((state) => ({
					byProject: { ...state.byProject, [projectId]: transcript },
				})),
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
