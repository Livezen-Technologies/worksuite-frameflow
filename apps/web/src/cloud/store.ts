"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CloudProjectSummary } from "@/account/types";

export interface CloudMediaLink {
	sha256: string;
	assetId: string;
}

/** A local project's link to its cloud copy (SRS 7: wve.cloud block). */
export interface CloudLink {
	cloudId: string;
	revision: number;
	syncedAt: string | null;
	/** The local updatedAt that was last pushed, to spot unsynced edits. */
	syncedLocalUpdatedAt: string | null;
	media: Record<string, CloudMediaLink>;
	/** Fingerprint of the content last synced, to tell real edits from re-saves. */
	contentHash?: string;
}

export type CloudSyncStatus =
	| { state: "idle" }
	| { state: "syncing"; progress: number; message: string }
	| { state: "error"; message: string }
	| { state: "conflict"; otherProjectId: string }
	/** Shared with this user as "Can view": changes are never uploaded. */
	| { state: "view-only"; hasLocalChanges: boolean };

interface CloudSyncStore {
	links: Record<string, CloudLink>;
	status: Record<string, CloudSyncStatus>;
	cloudProjects: CloudProjectSummary[];
	setLink: (args: { projectId: string; link: CloudLink | null }) => void;
	setStatus: (args: { projectId: string; status: CloudSyncStatus }) => void;
	setCloudProjects: (projects: CloudProjectSummary[]) => void;
}

export const useCloudSync = create<CloudSyncStore>()(
	persist(
		(set) => ({
			links: {},
			status: {},
			cloudProjects: [],
			setLink: ({ projectId, link }) =>
				set((state) => {
					const links = { ...state.links };
					if (link) links[projectId] = link;
					else delete links[projectId];
					return { links };
				}),
			setStatus: ({ projectId, status }) =>
				set((state) => ({ status: { ...state.status, [projectId]: status } })),
			setCloudProjects: (cloudProjects) => set({ cloudProjects }),
		}),
		{
			name: "frameflow-cloud-sync",
			partialize: (state) => ({
				links: state.links,
				cloudProjects: state.cloudProjects,
			}),
		},
	),
);

/** Local, Cloud or Both, for the project list (CL-03). */
export function projectLocation({
	projectId,
	links,
}: {
	projectId: string;
	links: Record<string, CloudLink>;
}): "local" | "both" {
	return links[projectId] ? "both" : "local";
}
