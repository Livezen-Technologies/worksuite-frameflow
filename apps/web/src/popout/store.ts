"use client";

import { create } from "zustand";

/** Editor panels that can move to their own window (SRS WS-03, MP-04). */
export type PopoutPanelId = "media" | "preview" | "timeline" | "properties";

export const POPOUT_TITLES: Record<PopoutPanelId, string> = {
	media: "Media",
	preview: "Preview",
	timeline: "Timeline",
	properties: "Properties",
};

interface PopoutStore {
	open: Partial<Record<PopoutPanelId, true>>;
	setOpen: (args: { id: PopoutPanelId; open: boolean }) => void;
}

export const usePopoutStore = create<PopoutStore>()((set) => ({
	open: {},
	setOpen: ({ id, open }) =>
		set((s) => {
			const next = { ...s.open };
			if (open) next[id] = true;
			else delete next[id];
			return { open: next };
		}),
}));
