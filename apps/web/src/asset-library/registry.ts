import { registerMotionPack, unregisterMotionPack, type PackIndex } from "@/lottie/catalog";
import { forgetPackAnimations } from "@/lottie/player";
import { installedPackBase } from "./catalog";
import type { InstalledPack, PackType } from "./types";

/*
 * Installed packs → the editor's panels. Each pack's index.json is read
 * from wsc-asset://<pack>/<version>/ and handed to the panel for its type:
 *   motion  → the Animations library (registerMotionPack)
 *   sounds  → Sounds → Packs (packSounds)
 *   fonts   → FontFace registrations, usable by name in text and slots
 *   others  → packContent(type): transitions, effects, filters, colour
 *             profiles, LUTs, templates, graphics, stickers and brand kits
 *             are listed here for their panels to pick up (those panels
 *             don't read dynamic packs yet).
 */

export interface PackSound {
	id: string;
	name: string;
	url: string;
	packId: string;
	packTitle: string;
}

export interface PackContentItem {
	id: string;
	name: string;
	/** URL of the item's main file. */
	url: string;
	packId: string;
	raw: Record<string, unknown>;
}

const registered = new Map<string, string>(); // packId → version
const sounds = new Map<string, PackSound[]>();
const content = new Map<string, { type: PackType; items: PackContentItem[] }>();
const fonts = new Map<string, FontFace[]>();
const listeners = new Set<() => void>();
const notify = () => {
	for (const listener of listeners) listener();
};

export function onPackContentChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function packSounds(): PackSound[] {
	return [...sounds.values()].flat();
}

export function packContent(type: PackType): PackContentItem[] {
	return [...content.values()].filter((c) => c.type === type).flatMap((c) => c.items);
}

type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Registers one installed pack's contents with its panel. */
export async function registerInstalledPack(pack: Pick<InstalledPack, "id" | "type" | "title" | "version">, fetcher: Fetcher = fetch): Promise<void> {
	if (registered.get(pack.id) === pack.version) return;
	const base = installedPackBase(pack.id, pack.version);
	const response = await fetcher(`${base}/index.json`);
	if (!response.ok) throw new Error(`Couldn't read pack ${pack.id}`);
	const index = (await response.json()) as Record<string, unknown>;
	unregisterInstalledPack(pack.id, { quiet: true });
	if (pack.type === "motion") {
		registerMotionPack({ packId: pack.id, version: pack.version, base, index: index as unknown as PackIndex });
		// Listed too, so "Download & Add" and drops know the pack's first animation.
		const assets = ((index as { assets?: Array<{ id: string; name?: string }> }).assets ?? []).filter((a) => typeof a?.id === "string");
		content.set(pack.id, { type: "motion", items: assets.map((a) => ({ id: `${pack.id}/${a.id}`, name: a.name ?? a.id, url: base, packId: pack.id, raw: a })) });
		// Placeholders and older versions of this pack redraw from the new files.
		forgetPackAnimations(pack.id);
	} else if (pack.type === "sounds") {
		const list = (index.sounds as Array<{ id: string; name?: string; file: string }>) ?? [];
		sounds.set(
			pack.id,
			list.map((s) => ({ id: `${pack.id}/${s.id}`, name: s.name ?? s.id, url: `${base}/${s.file}`, packId: pack.id, packTitle: pack.title })),
		);
	} else if (pack.type === "fonts" && typeof FontFace !== "undefined" && typeof document !== "undefined") {
		const list = (index.fonts as Array<{ family: string; weight?: number; style?: string; file: string }>) ?? [];
		const faces = list.map((f) => new FontFace(f.family, `url(${base}/${f.file})`, { weight: String(f.weight ?? 400), style: f.style ?? "normal" }));
		for (const face of faces) document.fonts.add(face);
		fonts.set(pack.id, faces);
		content.set(pack.id, { type: "fonts", items: list.map((f) => ({ id: f.family, name: f.family, url: `${base}/${f.file}`, packId: pack.id, raw: f })) });
	} else if (pack.type === "text-animations" || pack.type === "text-templates") {
		// Text library items are inline in index.json; `url` is the pack base for files they reference.
		const list = (index.items as Array<{ id: string; name?: { en?: string } }>) ?? [];
		content.set(pack.id, {
			type: pack.type,
			items: list.map((item) => ({ id: `${pack.id}/${item.id}`, name: item.name?.en ?? item.id, url: base, packId: pack.id, raw: item })),
		});
	} else {
		const list = (index.items as Array<{ id: string; name?: string; file: string }>) ?? [];
		content.set(pack.id, {
			type: pack.type,
			items: list.map((item) => ({ id: `${pack.id}/${item.id}`, name: item.name ?? item.id, url: `${base}/${item.file}`, packId: pack.id, raw: item })),
		});
	}
	registered.set(pack.id, pack.version);
	notify();
}

/** True once the pack's contents are registered with the panels. */
export function isPackRegistered(packId: string): boolean {
	return registered.has(packId);
}

/** Items of one installed pack. */
export function packItemsOf(packId: string): PackContentItem[] {
	return content.get(packId)?.items ?? [];
}

export function unregisterInstalledPack(packId: string, { quiet = false } = {}) {
	unregisterMotionPack(packId);
	sounds.delete(packId);
	content.delete(packId);
	for (const face of fonts.get(packId) ?? []) if (typeof document !== "undefined") document.fonts.delete(face);
	fonts.delete(packId);
	registered.delete(packId);
	if (!quiet) notify();
}

/** Brings registrations in line with what is installed. */
export async function syncInstalledPacks(installed: Record<string, InstalledPack>, fetcher?: Fetcher): Promise<string[]> {
	const failed: string[] = [];
	for (const id of [...registered.keys()]) if (!installed[id]) unregisterInstalledPack(id);
	for (const pack of Object.values(installed)) {
		try {
			await registerInstalledPack(pack, fetcher);
		} catch {
			failed.push(pack.id);
		}
	}
	return failed;
}
