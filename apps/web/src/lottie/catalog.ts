import type { LottieColorSlot } from "./types";

/** Where the bundled pack is served from (copied into public/ at build). */
export const PACK_BASE_URL = "/worksuite-pack";

export interface PackIndexAsset {
	id: string;
	name: string;
	category: string;
	path: string;
	tags: string[];
	durationSec: number;
	loop: boolean;
	width: number;
	height: number;
	colors: LottieColorSlot[];
	files: Record<string, { sha256: string }>;
}

export interface PackIndex {
	schema: 1;
	name: string;
	license: string;
	categories: Array<{ id: string; name: string; count: number }>;
	assets: PackIndexAsset[];
}

let indexPromise: Promise<PackIndex> | null = null;

export function loadPackIndex(): Promise<PackIndex> {
	indexPromise ??= fetch(`${PACK_BASE_URL}/index.json`)
		.then((response) => {
			if (!response.ok) throw new Error(`Couldn't load the animations library (${response.status})`);
			return response.json() as Promise<PackIndex>;
		})
		.catch((error) => {
			indexPromise = null;
			throw error;
		});
	return indexPromise;
}

export async function findPackAsset(assetId: string): Promise<PackIndexAsset | null> {
	const index = await loadPackIndex();
	return index.assets.find((asset) => asset.id === assetId) ?? null;
}

export function packAssetJsonUrl(asset: Pick<PackIndexAsset, "id" | "path">): string {
	return `${PACK_BASE_URL}/${asset.path}/${asset.id}.json`;
}

export function packAssetThumbnailUrl(asset: Pick<PackIndexAsset, "path">): string {
	return `${PACK_BASE_URL}/${asset.path}/thumbnail.png`;
}

/** Matches by name, id, category or tag; every word must match something. */
export function searchPackAssets({
	assets,
	query,
	category,
}: {
	assets: PackIndexAsset[];
	query: string;
	category?: string | null;
}): PackIndexAsset[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return assets.filter((asset) => {
		if (category && asset.category !== category) return false;
		if (words.length === 0) return true;
		const haystack = [asset.name, asset.id, asset.category, ...asset.tags].join(" ").toLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}
