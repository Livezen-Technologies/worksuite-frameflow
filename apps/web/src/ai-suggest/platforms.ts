"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Target platforms for clip suggestions (SRS AI-54): length limits change,
 * so they're settings the user can edit, never fixed in code paths. The
 * values here are only where they start.
 */
export interface PlatformLimit {
	id: string;
	name: string;
	/** Longest clip to suggest, in seconds. */
	maxSeconds: number;
	minSeconds: number;
	vertical: boolean;
}

const STARTING_LIMITS: PlatformLimit[] = [
	{ id: "shorts", name: "YouTube Shorts", maxSeconds: 60, minSeconds: 15, vertical: true },
	{ id: "tiktok", name: "TikTok", maxSeconds: 90, minSeconds: 15, vertical: true },
	{ id: "reels", name: "Instagram Reels", maxSeconds: 90, minSeconds: 15, vertical: true },
	{ id: "linkedin", name: "LinkedIn", maxSeconds: 120, minSeconds: 20, vertical: false },
];

interface PlatformState {
	platforms: PlatformLimit[];
	update: (args: { id: string; patch: Partial<PlatformLimit> }) => void;
	reset: () => void;
}

export const usePlatformLimits = create<PlatformState>()(
	persist(
		(set) => ({
			platforms: STARTING_LIMITS,
			update: ({ id, patch }) =>
				set((s) => ({
					platforms: s.platforms.map((p) => (p.id === id ? { ...p, ...patch } : p)),
				})),
			reset: () => set({ platforms: STARTING_LIMITS }),
		}),
		{ name: "frameflow-platform-limits" },
	),
);
