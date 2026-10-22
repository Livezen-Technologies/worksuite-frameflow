"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";

export interface EffectStackPreset {
	id: string;
	name: string;
	effects: { type: string; params: ParamValues; enabled: boolean }[];
}

interface EffectLibraryStore {
	favourites: string[];
	presets: EffectStackPreset[];
	toggleFavourite: (type: string) => void;
	savePreset: (args: {
		name: string;
		effects: EffectStackPreset["effects"];
	}) => EffectStackPreset;
	removePreset: (id: string) => void;
}

/** Favourite effects and saved effect stacks (SRS WS-22, WS-23), on this device. */
export const useEffectLibrary = create<EffectLibraryStore>()(
	persist(
		(set) => ({
			favourites: [],
			presets: [],
			toggleFavourite: (type) =>
				set((state) => ({
					favourites: state.favourites.includes(type)
						? state.favourites.filter((t) => t !== type)
						: [...state.favourites, type],
				})),
			savePreset: ({ name, effects }) => {
				const preset: EffectStackPreset = {
					id: `preset-${Date.now().toString(36)}`,
					name: name.trim() || "My effects",
					effects,
				};
				set((state) => ({ presets: [...state.presets, preset] }));
				return preset;
			},
			removePreset: (id) =>
				set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),
		}),
		{ name: "frameflow-effect-library" },
	),
);
