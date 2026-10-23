"use client";

import type { SyncedSetting } from "@/account/types";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useBrandKit } from "@/brand/store";
import { useEffectLibrary } from "@/effects/presets";
import { useLutLibrary } from "@/lut/library";
import { usePreviewStore } from "@/preview/preview-store";
import { useMyTextTemplates } from "@/text/templates";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useWorkspaceStore } from "@/workspaces/store";
import { mergeSettings, pickFields } from "./settings-merge";

/**
 * Settings sync (SRS CL-01): preferences, keyboard shortcuts, effect and
 * title presets, templates, workspaces, the brand kit and camera-LUT
 * answers follow the Worksuite account. Each store is synced as its saved
 * (localStorage) value; keys merge one by one, newest change wins.
 */
interface SyncedStore {
	key: string;
	label: string;
	rehydrate: () => unknown;
	subscribe: (listener: () => void) => () => void;
	/** Only these fields of the saved state are synced. */
	fields?: string[];
}

const store = ({
	key,
	label,
	api,
	fields,
}: {
	key: string;
	label: string;
	api: {
		persist: { rehydrate: () => unknown };
		subscribe: (listener: () => void) => () => void;
	};
	fields?: string[];
}): SyncedStore => ({
	key,
	label,
	rehydrate: () => api.persist.rehydrate(),
	subscribe: (listener) => api.subscribe(listener),
	fields,
});

export const SYNCED_STORES: SyncedStore[] = [
	store({
		key: "opencut-keybindings",
		label: "Keyboard shortcuts",
		api: useKeybindingsStore,
	}),
	store({
		key: "frameflow-effect-library",
		label: "Effect presets",
		api: useEffectLibrary,
	}),
	store({
		key: "frameflow-text-templates",
		label: "Title presets",
		api: useMyTextTemplates,
	}),
	store({ key: "frameflow-brand-kit", label: "Brand kit", api: useBrandKit }),
	store({
		key: "frameflow-workspaces",
		label: "Workspaces",
		api: useWorkspaceStore,
	}),
	store({
		key: "timeline-store",
		label: "Timeline preferences",
		api: useTimelineStore,
	}),
	store({
		key: "preview-settings",
		label: "Preview preferences",
		api: usePreviewStore,
	}),
	// LUT files stay on the device; the camera profile answers follow you.
	store({
		key: "frameflow-luts",
		label: "Camera LUT choices",
		api: useLutLibrary,
		fields: ["cameraProfiles", "autoApply"],
	}),
];

const META_KEY = "frameflow-settings-sync";

interface SyncMeta {
	enabled: boolean;
	revision: number;
	/** When each key last changed on this device. */
	stamps: Record<string, number>;
	/** The value each stamp refers to, to tell real edits from re-saves. */
	hashes: Record<string, string>;
	lastSyncedAt: number | null;
}

export function readMeta(): SyncMeta {
	try {
		const raw = localStorage.getItem(META_KEY);
		if (raw)
			return {
				enabled: true,
				stamps: {},
				hashes: {},
				revision: 0,
				lastSyncedAt: null,
				...JSON.parse(raw),
			};
	} catch {}
	return {
		enabled: true,
		revision: 0,
		stamps: {},
		hashes: {},
		lastSyncedAt: null,
	};
}

function writeMeta(meta: SyncMeta) {
	try {
		localStorage.setItem(META_KEY, JSON.stringify(meta));
	} catch {}
	for (const listener of metaListeners) listener(meta);
}

const metaListeners = new Set<(meta: SyncMeta) => void>();
export function onMetaChange(listener: (meta: SyncMeta) => void) {
	metaListeners.add(listener);
	return () => {
		metaListeners.delete(listener);
	};
}

export function setSettingsSyncEnabled(enabled: boolean) {
	writeMeta({ ...readMeta(), enabled });
}

function readLocal(entry: SyncedStore): unknown {
	try {
		const raw = localStorage.getItem(entry.key);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		return entry.fields
			? pickFields({ saved: parsed, fields: entry.fields })
			: parsed;
	} catch {
		return null;
	}
}

function writeLocal({ entry, value }: { entry: SyncedStore; value: unknown }) {
	let next = value;
	if (entry.fields) {
		let current: unknown = null;
		try {
			current = JSON.parse(localStorage.getItem(entry.key) ?? "null");
		} catch {}
		next = pickFields({ saved: value, fields: entry.fields, into: current });
	}
	localStorage.setItem(entry.key, JSON.stringify(next));
	void entry.rehydrate();
}

const hash = (value: unknown) => JSON.stringify(value) ?? "";

/** Stamps keys whose saved value changed since the last look. */
export function stampLocalChanges(): boolean {
	const meta = readMeta();
	let changed = false;
	for (const entry of SYNCED_STORES) {
		const h = hash(readLocal(entry));
		if (meta.hashes[entry.key] !== h) {
			// First look on this device: its values are defaults or older
			// than the cloud's, so the cloud wins (stamp 0).
			const firstLook = meta.hashes[entry.key] === undefined;
			meta.hashes[entry.key] = h;
			meta.stamps[entry.key] = firstLook ? 0 : Date.now();
			changed = true;
		}
	}
	if (changed) writeMeta(meta);
	return changed;
}

let running: Promise<void> | null = null;

/** Pulls, merges key by key, applies newer remote values, pushes the rest. */
export function syncSettings(): Promise<void> {
	running ??= (async () => {
		try {
			const cloud = window.worksuite?.cloud;
			if (!cloud || !readMeta().enabled) return;
			stampLocalChanges();
			for (let attempt = 0; attempt < 3; attempt++) {
				const remote = await cloud.sync("getSettings", {});
				if (!remote.ok) return;
				const meta = readMeta();
				const local: Record<string, SyncedSetting> = {};
				for (const entry of SYNCED_STORES) {
					const value = readLocal(entry);
					if (value !== null) {
						local[entry.key] = {
							value,
							updatedAt: meta.stamps[entry.key] ?? 0,
						};
					}
				}
				const { merged, applyLocally, pushNeeded } = mergeSettings({
					local,
					remote: remote.value.items,
				});
				for (const key of applyLocally) {
					const entry = SYNCED_STORES.find((e) => e.key === key);
					const item = merged[key];
					if (!entry || !item) continue;
					writeLocal({ entry, value: item.value });
					meta.stamps[key] = item.updatedAt;
					meta.hashes[key] = hash(readLocal(entry));
				}
				let revision = remote.value.revision;
				if (pushNeeded) {
					const put = await cloud.sync("putSettings", {
						revision,
						items: merged,
					});
					if (!put.ok) {
						if (put.code === "conflict") continue;
						return;
					}
					revision = put.value.revision;
				}
				writeMeta({ ...meta, revision, lastSyncedAt: Date.now() });
				return;
			}
		} finally {
			running = null;
		}
	})();
	return running;
}

/** Calls `onChange` (debounced) when any synced store changes. */
export function watchSyncedStores(onChange: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const offs = SYNCED_STORES.map((entry) =>
		entry.subscribe(() => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(onChange, 4000);
		}),
	);
	return () => {
		if (timer) clearTimeout(timer);
		for (const off of offs) off();
	};
}
