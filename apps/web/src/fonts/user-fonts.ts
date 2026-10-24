"use client";

import { create } from "zustand";
import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";

/**
 * Fonts the user imported (TTF, OTF, WOFF, WOFF2), kept on this device and
 * loaded when the app starts. Nothing is shipped with the app, so licensed
 * fonts (e.g. FM/DL Sinhala) stay with the person who owns them.
 */
export interface UserFont {
	id: string;
	family: string;
	fileName: string;
	data: ArrayBuffer;
	addedAt: number;
}

let adapter: IndexedDBAdapter<UserFont> | null = null;
const store = () => (adapter ??= new IndexedDBAdapter<UserFont>({ dbName: "frameflow-user-fonts", storeName: "fonts", version: 1 }));

const FONT_FILE = /\.(ttf|otf|woff2?)$/i;

/** "DL-Manel-Bold.ttf" → "DL-Manel-Bold": the file name is the family, so each file is its own font. */
export function familyFromFileName(fileName: string): string {
	return fileName.replace(FONT_FILE, "").replace(/[~_]+/g, " ").replace(/\s+/g, " ").trim();
}

export const useUserFonts = create<{
	fonts: Array<Pick<UserFont, "id" | "family" | "fileName" | "addedAt">>;
	loaded: boolean;
	setFonts: (fonts: Array<Pick<UserFont, "id" | "family" | "fileName" | "addedAt">>) => void;
}>()((set) => ({ fonts: [], loaded: false, setFonts: (fonts) => set({ fonts, loaded: true }) }));

const registered = new Map<string, FontFace>();

async function register(font: UserFont): Promise<boolean> {
	if (typeof FontFace === "undefined" || registered.has(font.id)) return true;
	try {
		const face = new FontFace(font.family, font.data);
		await face.load();
		document.fonts.add(face);
		registered.set(font.id, face);
		return true;
	} catch {
		return false;
	}
}

/** Loads every imported font into the page. Call once at start. */
export async function loadUserFonts(): Promise<void> {
	const fonts = await store()
		.getAll()
		.catch(() => [] as UserFont[]);
	await Promise.all(fonts.map(register));
	useUserFonts.getState().setFonts(fonts.map(({ id, family, fileName, addedAt }) => ({ id, family, fileName, addedAt })).sort((a, b) => a.family.localeCompare(b.family)));
}

/** Imports font files; returns how many were added and which files couldn't be read. */
export async function importFontFiles(files: File[]): Promise<{ added: string[]; failed: string[] }> {
	const added: string[] = [];
	const failed: string[] = [];
	const existing = new Set(useUserFonts.getState().fonts.map((f) => f.family.toLowerCase()));
	for (const file of files) {
		if (!FONT_FILE.test(file.name)) {
			failed.push(file.name);
			continue;
		}
		const family = familyFromFileName(file.name);
		const font: UserFont = { id: `font_${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, family, fileName: file.name, data: await file.arrayBuffer(), addedAt: Date.now() };
		if (!(await register(font))) {
			failed.push(file.name);
			continue;
		}
		await store().set({ key: font.id, value: font });
		if (!existing.has(family.toLowerCase())) added.push(family);
		existing.add(family.toLowerCase());
	}
	await loadUserFonts();
	return { added, failed };
}

export async function removeUserFont(id: string): Promise<void> {
	await store().remove(id);
	const face = registered.get(id);
	if (face) document.fonts.delete(face);
	registered.delete(id);
	await loadUserFonts();
}

/** Opens a file chooser for fonts and imports what's picked. */
export function pickFontFiles(): Promise<{ added: string[]; failed: string[] } | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.accept = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
		input.onchange = () => {
			const files = [...(input.files ?? [])];
			if (!files.length) return resolve(null);
			void importFontFiles(files).then(resolve);
		};
		input.click();
	});
}
