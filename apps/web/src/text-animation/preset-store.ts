import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TextAnimationPreset } from "./presets";

/** Personal presets, per device and synced with the account settings (cloud/settings-sync.ts). */
interface PresetState {
	presets: TextAnimationPreset[];
	save: (preset: Omit<TextAnimationPreset, "id" | "createdAt">) => TextAnimationPreset;
	remove: (id: string) => void;
}

let counter = 0;
export const usePresetStore = create<PresetState>()(
	persist(
		(set) => ({
			presets: [],
			save: (preset) => {
				const full: TextAnimationPreset = { ...structuredClone(preset), id: `tap-${Date.now().toString(36)}-${(counter++).toString(36)}`, createdAt: Date.now() };
				set((s) => ({ presets: [full, ...s.presets] }));
				return full;
			},
			remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
		}),
		{ name: "frameflow-text-animation-presets" },
	),
);

