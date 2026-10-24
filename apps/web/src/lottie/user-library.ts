import { unzipSync, strFromU8 } from "fflate";
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
	const name = file.name.toLowerCase();
	return name.endsWith(".json") || name.endsWith(".lottie") || file.type === "application/json";
}

/** The first animation's JSON text in a `.lottie` (dotLottie) archive, images inlined. */
export function dotLottieText(bytes: Uint8Array): string {
	const files = unzipSync(bytes);
	let manifestId: string | undefined;
	if (files["manifest.json"]) {
		const manifest: unknown = JSON.parse(strFromU8(files["manifest.json"]));
		const list = manifest && typeof manifest === "object" && "animations" in manifest ? manifest.animations : null;
		const first: unknown = Array.isArray(list) ? list[0] : null;
		if (first && typeof first === "object" && "id" in first && typeof first.id === "string") manifestId = first.id;
	}
	const path =
		(manifestId && [`animations/${manifestId}.json`, `a/${manifestId}.json`].find((p) => files[p])) ||
		Object.keys(files).find((p) => /^(animations|a)\/[^/]+\.json$/.test(p));
	if (!path) throw new Error("This .lottie file has no animation in it.");
	const json: unknown = JSON.parse(strFromU8(files[path]));
	// Images live beside the animation; inline them so the JSON stands alone.
	if (json && typeof json === "object" && "assets" in json && Array.isArray(json.assets)) {
		const assets: unknown[] = json.assets;
		for (const asset of assets) {
			if (!asset || typeof asset !== "object" || !("p" in asset)) continue;
			const name = typeof asset.p === "string" ? asset.p : null;
			if (!name || ("e" in asset && asset.e === 1)) continue;
			const data = files[`images/${name}`] ?? files[`i/${name}`];
			if (!data) continue;
			const type = name.toLowerCase().endsWith(".png") ? "image/png" : name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
			let binary = "";
			for (const byte of data) binary += String.fromCharCode(byte);
			Object.assign(asset, { p: `data:${type};base64,${btoa(binary)}`, u: "", e: 1 });
		}
	}
	return JSON.stringify(json);
}

/** Reads, checks and stores a user's Lottie file. */
export async function importUserLottie(file: File): Promise<UserLottie> {
	const text = file.name.toLowerCase().endsWith(".lottie")
		? dotLottieText(new Uint8Array(await file.arrayBuffer()))
		: await file.text();
	const json = parseLottie(text);
	const id = (await sha256(text)).slice(0, 32);
	const existing = await store().get(id);
	if (existing) return existing;
	const entry: UserLottie = {
		id,
		name: file.name.replace(/\.(json|lottie)$/i, "") || json.nm || "Animation",
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
