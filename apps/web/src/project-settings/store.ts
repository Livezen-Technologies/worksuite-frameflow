"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TProjectSettings } from "@/project/types";
import { generateUUID } from "@/utils/id";

/** Settings a template carries; the background stays per project. */
export type TemplateSettings = Omit<TProjectSettings, "background">;

export interface SettingsTemplate {
	id: string;
	name: string;
	settings: TemplateSettings;
	builtIn?: boolean;
}

/** Starting points for new projects (PS-24). */
export const BUILT_IN_TEMPLATES: SettingsTemplate[] = [
	{
		id: "youtube-1080",
		name: "YouTube 1080p 30 fps",
		builtIn: true,
		settings: {
			canvasSize: { width: 1920, height: 1080 },
			fps: { numerator: 30, denominator: 1 },
		},
	},
	{
		id: "youtube-4k",
		name: "YouTube 4K 60 fps",
		builtIn: true,
		settings: {
			canvasSize: { width: 3840, height: 2160 },
			fps: { numerator: 60, denominator: 1 },
		},
	},
	{
		id: "tiktok",
		name: "TikTok / Reels 1080×1920 30 fps",
		builtIn: true,
		settings: {
			canvasSize: { width: 1080, height: 1920 },
			fps: { numerator: 30, denominator: 1 },
		},
	},
	{
		id: "instagram-square",
		name: "Instagram square 1080 30 fps",
		builtIn: true,
		settings: {
			canvasSize: { width: 1080, height: 1080 },
			fps: { numerator: 30, denominator: 1 },
		},
	},
];

interface ProjectSettingsStore {
	open: boolean;
	setOpen: (open: boolean) => void;
	templates: SettingsTemplate[];
	saveTemplate: (args: { name: string; settings: TemplateSettings }) => void;
	removeTemplate: (id: string) => void;
}

export const useProjectSettings = create<ProjectSettingsStore>()(
	persist(
		(set) => ({
			open: false,
			setOpen: (open) => set({ open }),
			templates: [],
			saveTemplate: ({ name, settings }) =>
				set((s) => ({
					templates: [...s.templates, { id: generateUUID(), name, settings }],
				})),
			removeTemplate: (id) =>
				set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
		}),
		{
			name: "frameflow-project-templates",
			partialize: (s) => ({ templates: s.templates }),
		},
	),
);
