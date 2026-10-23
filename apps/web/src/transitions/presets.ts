"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClipTransition } from "./types";

/** A transition with its settings, saved under the user's name for it. */
export interface TransitionPreset {
	id: string;
	name: string;
	value: ClipTransition;
}

interface TransitionPresetStore {
	presets: TransitionPreset[];
	save: (args: { name: string; value: ClipTransition }) => TransitionPreset;
	remove: (id: string) => void;
}

/** Custom transition presets, kept on this device. */
export const useTransitionPresets = create<TransitionPresetStore>()(
	persist(
		(set) => ({
			presets: [],
			save: ({ name, value }) => {
				const preset = { id: `tp-${Date.now().toString(36)}`, name: name.trim() || "My transition", value };
				set((s) => ({ presets: [...s.presets, preset] }));
				return preset;
			},
			remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
		}),
		{ name: "frameflow-transition-presets" },
	),
);
