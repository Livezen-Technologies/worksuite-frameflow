"use client";

import { create } from "zustand";

/** Which clip the Motion Editor has open. */
export const useMotionEditor = create<{
	target: { trackId: string; elementId: string } | null;
	openFor: (target: { trackId: string; elementId: string }) => void;
	close: () => void;
}>((set) => ({
	target: null,
	openFor: (target) => set({ target }),
	close: () => set({ target: null }),
}));

const PRESETS_KEY = "wsc.motion-presets";

export interface MotionPreset {
	id: string;
	name: string;
	createdAt: number;
	/** Serialized LottieElementData (asset reference + overrides). */
	data: string;
}

/** "Save as my asset": edits kept on this device as a reusable preset. */
export function saveMotionPreset(name: string, data: string): MotionPreset {
	const preset = { id: `p${Date.now().toString(36)}`, name, createdAt: Date.now(), data };
	try {
		const list = listMotionPresets();
		localStorage.setItem(PRESETS_KEY, JSON.stringify([preset, ...list].slice(0, 200)));
	} catch {
		// Storage unavailable: the preset still applies to this clip.
	}
	return preset;
}

export function listMotionPresets(): MotionPreset[] {
	try {
		return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]") as MotionPreset[];
	} catch {
		return [];
	}
}
