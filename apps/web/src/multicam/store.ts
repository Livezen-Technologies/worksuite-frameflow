"use client";

import { create } from "zustand";

/** Which multicam clip the angle viewer shows, and whether create is open. */
export const useMulticamUi = create<{
	viewerGroupId: string | null;
	createOpen: boolean;
	openViewer: (groupId: string | null) => void;
	setCreateOpen: (open: boolean) => void;
}>()((set) => ({
	viewerGroupId: null,
	createOpen: false,
	openViewer: (viewerGroupId) => set({ viewerGroupId }),
	setCreateOpen: (createOpen) => set({ createOpen }),
}));
