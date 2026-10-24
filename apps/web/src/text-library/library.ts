import { onPackContentChange, packContent } from "@/asset-library/registry";
import type { TextLibraryItem, TextPackIndex } from "./manifest";
import { combinePacks, TEXT_PACKS_BASE, type TextLibraryContent } from "./library-content";

export { combinePacks, TEXT_PACKS_BASE, type LibraryEntry, type TextLibraryContent } from "./library-content";

/**
 * The Text library's content: built-in packs served from /text-packs
 * (copied from assets/packs at build), plus text packs installed from the
 * download center. Items keep a `base` URL for files they reference.
 */

let builtIn: Promise<TextPackIndex[]> | null = null;

async function loadBuiltIn(fetcher: typeof fetch): Promise<TextPackIndex[]> {
	const list = await fetcher(`${TEXT_PACKS_BASE}/packs.json`);
	if (!list.ok) throw new Error("Couldn't load the text library");
	const { packs } = (await list.json()) as { packs: Array<{ type: string; id: string }> };
	return Promise.all(
		packs.map(async (p) => {
			const r = await fetcher(`${TEXT_PACKS_BASE}/${p.type}/${p.id}/index.json`);
			if (!r.ok) throw new Error(`Couldn't load ${p.id}`);
			return (await r.json()) as TextPackIndex;
		}),
	);
}

function installedIndexes(): Array<TextPackIndex & { base: string }> {
	const byPack = new Map<string, TextPackIndex & { base: string }>();
	for (const type of ["text-animations", "text-templates"] as const)
		for (const item of packContent(type)) {
			let index = byPack.get(item.packId);
			if (!index) {
				index = { schema: 1, type, id: item.packId, version: "", name: item.packId, categories: [], items: [], base: item.url };
				byPack.set(item.packId, index);
			}
			index.items.push(item.raw as unknown as TextLibraryItem);
			const cat = (item.raw as { category?: string }).category;
			if (cat && !index.categories.some((c) => c.id === cat)) index.categories.push({ id: cat, name: { en: cat.replace(/-/g, " ").replace(/^\w/, (m) => m.toUpperCase()) } });
		}
	return [...byPack.values()];
}

/** Everything in the library now (built-in + installed). */
export async function loadTextLibrary(fetcher: typeof fetch = fetch): Promise<TextLibraryContent> {
	builtIn ??= loadBuiltIn(fetcher).catch((error) => {
		builtIn = null;
		throw error;
	});
	let packs: TextPackIndex[] = [];
	try {
		packs = await builtIn;
	} catch {
		// Offline dev without copied packs: installed packs still show.
	}
	return combinePacks([...packs, ...installedIndexes()]);
}

export const onTextLibraryChange = onPackContentChange;

/** For tests and the harness: preload built-in packs without fetching. */
export function setBuiltInTextPacks(indexes: TextPackIndex[]) {
	builtIn = Promise.resolve(indexes);
}
