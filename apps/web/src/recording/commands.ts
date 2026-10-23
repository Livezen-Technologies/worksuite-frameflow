"use client";

import { create } from "zustand";

/**
 * Lets a global shortcut start a recording when the Record panel isn't
 * open: the host opens the panel and leaves a pending start for it.
 */
export const useRecordingCommands = create<{
	panelOpen: boolean;
	pendingStart: boolean;
	setPanelOpen: (open: boolean) => void;
	setPendingStart: (pending: boolean) => void;
}>()((set) => ({
	panelOpen: false,
	pendingStart: false,
	setPanelOpen: (panelOpen) => set({ panelOpen }),
	setPendingStart: (pendingStart) => set({ pendingStart }),
}));
