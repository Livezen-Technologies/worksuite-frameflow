"use client";

import { create } from "zustand";

/**
 * Which editor the project is open in: the video editor or the Audio
 * Studio. Both edit the same timeline, so switching never loses sync.
 */
export const useStudioStore = create<{
	studio: "video" | "audio";
	setStudio: (studio: "video" | "audio") => void;
}>()((set) => ({
	studio: "video",
	setStudio: (studio) => set({ studio }),
}));
