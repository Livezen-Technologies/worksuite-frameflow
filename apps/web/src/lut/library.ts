"use client";

import { unzipSync } from "fflate";
import { uploadLut } from "opencut-wasm";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import { generateUUID } from "@/utils/id";
import { type CameraBrand, cameraKey, identifyLutFile } from "./cameras";
import { cubeToRgba8, parseCube } from "./cube";

/** A LUT in the library (SRS WS-11, WS-35, WS-40). Texels live in IndexedDB. */
export interface LutEntry {
	id: string;
	name: string;
	size: number;
	kind: "camera" | "creative";
	brand?: CameraBrand;
	model?: string;
	profile?: string;
	/** Where it came from (WS-39): FrameFlow bundles no vendor files. */
	source: "imported";
	fileName: string;
	importedAt: number;
}

interface LutLibraryStore {
	luts: LutEntry[];
	/** Remembered "what profile does this camera shoot?" answers (WS-45). */
	cameraProfiles: Record<string, string>;
	/** Apply a matching camera LUT automatically on import (WS-36). */
	autoApply: boolean;
	add: (entry: LutEntry) => void;
	remove: (id: string) => void;
	rememberProfile: (args: { camera: string; profile: string }) => void;
	setAutoApply: (on: boolean) => void;
}

export const useLutLibrary = create<LutLibraryStore>()(
	persist(
		(set) => ({
			luts: [],
			cameraProfiles: {},
			autoApply: false,
			add: (entry) =>
				set((s) => ({
					// One LUT per camera + profile: a new import replaces the old.
					luts: [
						...s.luts.filter(
							(l) =>
								!(
									entry.kind === "camera" &&
									l.kind === "camera" &&
									l.brand === entry.brand &&
									l.model === entry.model &&
									l.profile === entry.profile
								),
						),
						entry,
					],
				})),
			remove: (id) => set((s) => ({ luts: s.luts.filter((l) => l.id !== id) })),
			rememberProfile: ({ camera, profile }) =>
				set((s) => ({
					cameraProfiles: { ...s.cameraProfiles, [camera]: profile },
				})),
			setAutoApply: (autoApply) => set({ autoApply }),
		}),
		{ name: "frameflow-luts" },
	),
);

interface LutData {
	size: number;
	rgba: Uint8Array;
}

const lutData = new IndexedDBAdapter<LutData>({
	dbName: "frameflow-lut-data",
	storeName: "luts",
	version: 1,
});

export interface ImportResult {
	added: LutEntry[];
	failed: { name: string; reason: string }[];
}

async function importCube({
	name,
	text,
}: {
	name: string;
	text: string;
}): Promise<LutEntry> {
	const lut = parseCube(text);
	const { camera, brand, profile } = identifyLutFile(`${name} ${lut.title}`);
	const id = generateUUID();
	await lutData.set({
		key: id,
		value: { size: lut.size, rgba: cubeToRgba8(lut) },
	});
	const isCamera =
		!!brand && !!profile && profile !== "Normal" && profile !== "Native";
	return {
		id,
		name: (lut.title || name).replace(/\.cube$/i, ""),
		size: lut.size,
		kind: isCamera ? "camera" : "creative",
		...(brand ? { brand } : {}),
		...(camera ? { model: camera.model } : {}),
		...(profile ? { profile } : {}),
		source: "imported",
		fileName: name,
		importedAt: Date.now(),
	};
}

/** Imports .cube files, ZIPs of them, or a folder's files (WS-11, WS-44). */
export async function importLutFiles(files: File[]): Promise<ImportResult> {
	const result: ImportResult = { added: [], failed: [] };
	const sources: { name: string; text: () => Promise<string> }[] = [];
	for (const file of files) {
		if (/\.zip$/i.test(file.name)) {
			try {
				const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
				for (const [path, bytes] of Object.entries(entries)) {
					if (!/\.cube$/i.test(path) || path.includes("__MACOSX")) continue;
					sources.push({
						name: path.split("/").pop() ?? path,
						text: async () => new TextDecoder().decode(bytes),
					});
				}
			} catch {
				result.failed.push({
					name: file.name,
					reason: "Couldn't open the ZIP.",
				});
			}
		} else if (/\.cube$/i.test(file.name)) {
			sources.push({ name: file.name, text: () => file.text() });
		}
	}
	for (const source of sources) {
		try {
			const entry = await importCube({
				name: source.name,
				text: await source.text(),
			});
			useLutLibrary.getState().add(entry);
			result.added.push(entry);
		} catch (error) {
			result.failed.push({
				name: source.name,
				reason:
					error instanceof Error ? error.message : "Not a valid .cube file.",
			});
		}
	}
	return result;
}

export async function removeLut(id: string): Promise<void> {
	useLutLibrary.getState().remove(id);
	uploaded.delete(id);
	await lutData.remove(id).catch(() => {});
}

export function cameraLutFor({
	brand,
	model,
	profile,
}: {
	brand: CameraBrand;
	model?: string;
	profile: string;
}): LutEntry | null {
	const luts = useLutLibrary
		.getState()
		.luts.filter(
			(l) => l.kind === "camera" && l.brand === brand && l.profile === profile,
		);
	return (
		luts.find((l) => l.model === model) ?? luts.find((l) => !l.model) ?? null
	);
}

export function rememberedProfile({
	brand,
	model,
}: {
	brand: CameraBrand;
	model: string;
}) {
	return (
		useLutLibrary.getState().cameraProfiles[cameraKey({ brand, model })] ?? null
	);
}

// --- GPU upload -----------------------------------------------------------

const uploaded = new Set<string>();
const pending = new Set<string>();

/**
 * Makes sure the GPU has the LUT. Called while resolving a frame; the first
 * frames draw unchanged until the upload lands, then the preview redraws.
 */
export function ensureLutUploaded(id: string): void {
	if (!id || uploaded.has(id) || pending.has(id)) return;
	pending.add(id);
	void lutData
		.get(id)
		.then((data) => {
			if (!data) return;
			uploadLut(id, data.size, data.rgba);
			uploaded.add(id);
			effectPreviewService.generation++;
		})
		.catch((error) => console.error("LUT upload failed:", error))
		.finally(() => pending.delete(id));
}

/**
 * Uploads a LUT made in code (curves, HSL) under `id`, once; `make` runs
 * only when the engine doesn't have it yet.
 */
export function ensureGeneratedLutUploaded({
	id,
	size,
	make,
}: {
	id: string;
	size: number;
	make: () => Uint8Array;
}): void {
	if (uploaded.has(id)) return;
	uploadLut(id, size, make());
	uploaded.add(id);
}

/** The compositor was (re)created and lost its LUTs: upload again on use. */
export function forgetUploadedLuts(): void {
	uploaded.clear();
}
