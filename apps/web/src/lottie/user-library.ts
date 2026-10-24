import { unzipSync, strFromU8 } from "fflate";
import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import { detectColorSlots, hasTextLayers, parseLottie } from "./colors";
import type { LottieColorSlot, LottieJson, LottieTextSlot } from "./types";
import { readLottieFile, type ImportedAnimation } from "./io/import";

/**
 * Lottie files the user imported. Kept once per device, keyed by a hash of
 * the file, so projects only store the id and their colour overrides.
 */
export interface UserLottie {
	id: string;
	name: string;
	json: LottieJson;
	colors: LottieColorSlot[];
	/** Text layers of an imported file, editable like pack text slots. */
	textSlots?: LottieTextSlot[];
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

/**
 * Reads a Lottie JSON or dotLottie file and stores the chosen animations
 * (all of them unless `pick` narrows a multi-animation .lottie).
 */
export async function importUserLottieFile(
	file: File,
	pick?: (choices: ImportedAnimation[]) => Promise<ImportedAnimation[]>,
): Promise<UserLottie[]> {
	const found = readLottieFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
	const chosen = found.length > 1 && pick ? await pick(found) : found;
	const out: UserLottie[] = [];
	for (const anim of chosen) {
		const text = JSON.stringify(anim.json);
		const id = (await sha256(text)).slice(0, 32);
		const existing = await store().get(id);
		if (existing) {
			out.push(existing);
			continue;
		}
		const entry: UserLottie = {
			id,
			name: anim.name,
			json: anim.json,
			colors: anim.colors,
			...(anim.textSlots.length ? { textSlots: anim.textSlots } : {}),
			importedAt: Date.now(),
		};
		await store().set({ key: id, value: entry });
		out.push(entry);
	}
	return out;
}

/** Reads, checks and stores a user's Lottie file (first animation only; see importUserLottieFile). */
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

/** Stores (or replaces) an animation under a fixed id, e.g. one published from Motion Studio. */
export async function saveUserLottie({ id, name, json }: { id: string; name: string; json: LottieJson }): Promise<UserLottie> {
	const previous = await store().get(id);
	const entry: UserLottie = { id, name, json, colors: detectColorSlots(json), importedAt: previous?.importedAt ?? Date.now() };
	await store().set({ key: id, value: entry });
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
