"use client";

import { create } from "zustand";

/**
 * What the startup screen asked the editor to do once the new project is
 * open: start a screen recording, or import the files dropped on it.
 * Kept in memory only; it is consumed as soon as the editor loads.
 */
export type StartIntent = { kind: "record" } | { kind: "import"; files: File[] };

export const useStartIntent = create<{
	intent: StartIntent | null;
	projectId: string | null;
	set: (args: { projectId: string; intent: StartIntent }) => void;
	take: (projectId: string) => StartIntent | null;
}>()((set, get) => ({
	intent: null,
	projectId: null,
	set: ({ projectId, intent }) => set({ projectId, intent }),
	take: (projectId) => {
		const { intent, projectId: forProject } = get();
		if (!intent || forProject !== projectId) return null;
		set({ intent: null, projectId: null });
		return intent;
	},
}));

const MEDIA_FILE = /\.(mp4|mov|m4v|webm|mkv|avi|mp3|wav|m4a|aac|flac|ogg|opus|png|jpe?g|gif|webp|heic|heif|avif)$/i;

/** Video, audio and image files only (dropped folders and other files are ignored). */
export function mediaFilesOnly(files: File[]): File[] {
	return files.filter((f) => /^(video|audio|image)\//.test(f.type) || MEDIA_FILE.test(f.name));
}
