"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * AI suggestions (SRS AI-52, AI-53): nothing changes in the project until
 * the user approves a suggestion; until then it shows dashed, with the
 * model's confidence.
 */
export type SuggestionKind = "clip" | "reframe" | "zoom" | "caption";

export interface Suggestion {
	id: string;
	kind: SuggestionKind;
	/** Timeline seconds. */
	start: number;
	end: number;
	title?: string;
	reason?: string;
	/** 0–1, as the model reports it. */
	confidence: number;
	/** Clip layout, e.g. "vertical" or "landscape". */
	layout?: string;
	/** Caption look for a clip, e.g. "word highlight". */
	captionStyle?: string;
	/** Reframe focus, 0–1 across the frame. */
	x?: number;
	y?: number;
	text?: string;
	status: "pending" | "approved" | "rejected";
}

interface SuggestionState {
	byProject: Record<string, Suggestion[]>;
	add: (args: { projectId: string; suggestions: Suggestion[] }) => void;
	setStatus: (args: { projectId: string; id: string; status: Suggestion["status"] }) => void;
	clear: (args: { projectId: string; kind?: SuggestionKind }) => void;
}

export const useSuggestions = create<SuggestionState>()(
	persist(
		(set) => ({
			byProject: {},
			add: ({ projectId, suggestions }) =>
				set((s) => ({
					byProject: {
						...s.byProject,
						[projectId]: [...(s.byProject[projectId] ?? []), ...suggestions],
					},
				})),
			setStatus: ({ projectId, id, status }) =>
				set((s) => ({
					byProject: {
						...s.byProject,
						[projectId]: (s.byProject[projectId] ?? []).map((x) =>
							x.id === id ? { ...x, status } : x,
						),
					},
				})),
			clear: ({ projectId, kind }) =>
				set((s) => ({
					byProject: {
						...s.byProject,
						[projectId]: kind
							? (s.byProject[projectId] ?? []).filter((x) => x.kind !== kind)
							: [],
					},
				})),
		}),
		{ name: "frameflow-ai-suggestions" },
	),
);
