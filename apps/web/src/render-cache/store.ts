"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RenderCacheMode = "off" | "manual" | "auto";
/** Fraction of the project size the cache is rendered at (PS-14). */
export type CacheQuality = 1 | 0.5 | 0.25;

interface RenderCacheSettings {
	mode: RenderCacheMode;
	quality: CacheQuality;
	set: (patch: Partial<Pick<RenderCacheSettings, "mode" | "quality">>) => void;
}

export const useRenderCacheSettings = create<RenderCacheSettings>()(
	persist(
		(set) => ({ mode: "manual", quality: 0.5, set: (patch) => set(patch) }),
		{ name: "frameflow-render-cache" },
	),
);

/** Live state for the toolbar and timeline strip. */
export const useRenderCacheStatus = create<{
	/** Segment index → "cached" | "stale" for the current timeline. */
	segments: ("cached" | "stale")[];
	rendering: { done: number; total: number } | null;
	update: (
		patch: Partial<{
			segments: ("cached" | "stale")[];
			rendering: { done: number; total: number } | null;
		}>,
	) => void;
}>()((set) => ({
	segments: [],
	rendering: null,
	update: (patch) => set(patch),
}));
