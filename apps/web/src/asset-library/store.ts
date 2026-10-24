"use client";

import { create } from "zustand";
import { isMeteredConnection, missingPacks, planMissingPacks, projectPackRefs } from "./catalog";
import { syncInstalledPacks } from "./registry";
import type { AssetStoreState, WorksuiteAssetsBridge } from "./types";

export function assetsBridge(): WorksuiteAssetsBridge | null {
	return typeof window === "undefined" ? null : (window.worksuite?.assets ?? null);
}

interface AssetLibraryStore {
	state: AssetStoreState | null;
	open: boolean;
	/** Pack ids a project needs that wait for the user's go-ahead ("ask"). */
	pendingAsk: string[];
	error: string | null;
	setOpen: (open: boolean, focusType?: string | null) => void;
	focusType: string | null;
	init: () => Promise<void>;
	install: (packId: string) => Promise<void>;
	run: (action: (bridge: WorksuiteAssetsBridge) => Promise<unknown>) => Promise<void>;
	dismissAsk: () => void;
}

let started = false;

export const useAssetLibrary = create<AssetLibraryStore>((set, get) => ({
	state: null,
	open: false,
	pendingAsk: [],
	error: null,
	focusType: null,
	setOpen: (open, focusType = null) => set({ open, focusType }),
	init: async () => {
		const bridge = assetsBridge();
		if (!bridge || started) return;
		started = true;
		bridge.onChange((state) => {
			set({ state });
			void syncInstalledPacks(state.installed);
		});
		const state = await bridge.getState();
		set({ state });
		await syncInstalledPacks(state.installed);
		if (!state.catalog) void bridge.refresh();
	},
	install: async (packId) => {
		const bridge = assetsBridge();
		if (!bridge) {
			set({ error: "Downloading packs needs the desktop app." });
			return;
		}
		try {
			await bridge.install(packId);
		} catch (error) {
			set({ error: error instanceof Error ? error.message : String(error) });
		}
	},
	run: async (action) => {
		const bridge = assetsBridge();
		if (!bridge) return;
		try {
			await action(bridge);
		} catch (error) {
			set({ error: error instanceof Error ? error.message : String(error) });
		}
	},
	dismissAsk: () => set({ pendingAsk: [] }),
}));

/**
 * Checks a project's clips for packs that aren't installed and acts on the
 * "missing packs" setting: installs them (auto), queues a prompt (ask) or
 * leaves the placeholders (never / offline). Returns the plan.
 */
export async function ensureProjectPacks(elements: Parameters<typeof projectPackRefs>[0]) {
	const { state } = useAssetLibrary.getState();
	if (!state) return null;
	const missing = missingPacks(projectPackRefs(elements), state);
	if (!missing.length) return { install: [], ask: [], placeholder: [] };
	const plan = planMissingPacks({
		missing,
		policy: state.settings.missingPacks,
		online: typeof navigator === "undefined" ? true : navigator.onLine,
		metered: isMeteredConnection(typeof navigator === "undefined" ? undefined : (navigator as never)),
		unmeteredOnly: state.settings.unmeteredOnly,
		catalog: state.catalog?.packs ?? [],
	});
	for (const id of plan.install) void useAssetLibrary.getState().install(id);
	if (plan.ask.length) useAssetLibrary.setState({ pendingAsk: plan.ask });
	return plan;
}
