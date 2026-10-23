"use client";

import { create } from "zustand";

/** Whether this window is the main one, and the save-failed prompt (MP-11). */
export const useWindowState = create<{
	isMain: boolean;
	saveFailed: { projectId: string; error: string; then: () => void } | null;
	set: (
		patch: Partial<{
			isMain: boolean;
			saveFailed: { projectId: string; error: string; then: () => void } | null;
		}>,
	) => void;
}>()((set) => ({ isMain: true, saveFailed: null, set: (patch) => set(patch) }));
