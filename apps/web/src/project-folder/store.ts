"use client";

import { create } from "zustand";
import type { FolderMediaEntry } from "./format";

export type FolderStatus = "idle" | "saving" | "saved" | "error";

interface ProjectFolderStore {
	/** Project id → folder path, for projects saved as a folder. */
	links: Record<string, string>;
	status: Record<string, FolderStatus>;
	errors: Record<string, string>;
	/** Media an opened folder was missing, waiting for the user to relink. */
	relink: { projectId: string; missing: FolderMediaEntry[] } | null;
	setLink: (args: { projectId: string; path: string | null }) => void;
	setStatus: (args: {
		projectId: string;
		status: FolderStatus;
		error?: string;
	}) => void;
	setRelink: (relink: ProjectFolderStore["relink"]) => void;
}

export const useProjectFolders = create<ProjectFolderStore>()((set) => ({
	links: {},
	status: {},
	errors: {},
	relink: null,
	setLink: ({ projectId, path }) =>
		set((s) => {
			const links = { ...s.links };
			if (path) links[projectId] = path;
			else delete links[projectId];
			return { links };
		}),
	setStatus: ({ projectId, status, error }) =>
		set((s) => ({
			status: { ...s.status, [projectId]: status },
			errors: { ...s.errors, [projectId]: error ?? "" },
		})),
	setRelink: (relink) => set({ relink }),
}));
