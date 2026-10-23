"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HelperGpu } from "./bridge";
import type { ProxyMode } from "./rules";

export type ProxyState =
	| { state: "queued" }
	| { state: "making"; progress: number }
	| { state: "ready"; size: number }
	| { state: "failed"; error: string };

interface ProxySettings {
	mode: ProxyMode;
	height: number;
	gpu: HelperGpu;
	priority: "background" | "normal";
	concurrency: number;
	/** Preview toolbar switch: show proxies or originals. */
	usePreview: boolean;
	set: (patch: Partial<Omit<ProxySettings, "set">>) => void;
}

export const useProxySettings = create<ProxySettings>()(
	persist(
		(set) => ({
			mode: "auto",
			height: 540,
			gpu: "auto",
			priority: "background",
			concurrency: 1,
			usePreview: true,
			set: (patch) => set(patch),
		}),
		{ name: "frameflow-proxies" },
	),
);

/** Live status per media id (not persisted). */
export const useProxyStatus = create<{
	byMedia: Record<string, ProxyState>;
	setStatus: (args: { mediaId: string; status: ProxyState | null }) => void;
}>()((set) => ({
	byMedia: {},
	setStatus: ({ mediaId, status }) =>
		set((s) => {
			const byMedia = { ...s.byMedia };
			if (status) byMedia[mediaId] = status;
			else delete byMedia[mediaId];
			return { byMedia };
		}),
}));
