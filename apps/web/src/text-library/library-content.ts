import type { TextLibraryAnimation, TextLibraryItem, TextLibraryTemplate, TextPackIndex } from "./manifest";

export const TEXT_PACKS_BASE = "/text-packs";

export type LibraryEntry<T extends TextLibraryItem = TextLibraryItem> = T & { packId: string; base: string };

export interface TextLibraryContent {
	animations: LibraryEntry<TextLibraryAnimation>[];
	templates: LibraryEntry<TextLibraryTemplate>[];
	categories: { animations: TextPackIndex["categories"]; templates: TextPackIndex["categories"] };
}

/** Combines pack indexes (later packs win on id clashes). */
export function combinePacks(indexes: Array<TextPackIndex & { base?: string }>): TextLibraryContent {
	const out: TextLibraryContent = { animations: [], templates: [], categories: { animations: [], templates: [] } };
	const seen = new Map<string, number>();
	for (const index of indexes) {
		const base = index.base ?? `${TEXT_PACKS_BASE}/${index.type}/${index.id}`;
		const cats = index.type === "text-animations" ? out.categories.animations : out.categories.templates;
		for (const c of index.categories) if (!cats.some((x) => x.id === c.id)) cats.push(c);
		for (const item of index.items) {
			const entry = { ...item, packId: index.id, base } as LibraryEntry;
			const key = `${item.kind}:${item.id}`;
			const list = (item.kind === "animation" ? out.animations : out.templates) as LibraryEntry[];
			const at = seen.get(key);
			if (at !== undefined) list[at] = entry;
			else {
				seen.set(key, list.length);
				list.push(entry);
			}
		}
	}
	return out;
}

