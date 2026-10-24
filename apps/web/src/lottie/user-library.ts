import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import { detectColorSlots, hasTextLayers, parseLottie } from "./colors";
import type { LottieColorSlot, LottieJson } from "./types";

/**
 * Lottie files the user imported. Kept once per device, keyed by a hash of
 * the file, so projects only store the id and their colour overrides.
 */
export interface UserLottie {
	id: string;
	name: string;
	json: LottieJson;
	colors: LottieColorSlot[];
	importedAt: number;
}

let adapter: IndexedDBAdapter<UserLottie> | null = null;
const store = () =>
	(adapter ??= new IndexedDBAdapter<UserLottie>({
		dbName: "frameflow-lottie",
		storeName: "animations",
		version: 1,
	}));

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isLottieFile(file: File): boolean {
	return file.name.toLowerCase().endsWith(".json") || file.type === "application/json";
}

/** Reads, checks and stores a user's Lottie file. */
export async function importUserLottie(file: File): Promise<UserLottie> {
	const text = await file.text();
	const json = parseLottie(text);
	const id = (await sha256(text)).slice(0, 32);
	const existing = await store().get(id);
	if (existing) return existing;
	const entry: UserLottie = {
		id,
		name: file.name.replace(/\.json$/i, "") || json.nm || "Animation",
		json,
		colors: detectColorSlots(json),
		importedAt: Date.now(),
	};
	await store().set({ key: id, value: entry });
	if (hasTextLayers(json)) {
		// Text layers are drawn, but their words can't be edited here.
		console.info(`${file.name} has text layers; they play as drawn.`);
	}
	return entry;
}

export function getUserLottie(id: string): Promise<UserLottie | null> {
	return store().get(id);
}

export async function listUserLotties(): Promise<UserLottie[]> {
	const items = await store().getAll();
	return items.sort((a, b) => b.importedAt - a.importedAt);
}

export function removeUserLottie(id: string): Promise<void> {
	return store().remove(id);
}
