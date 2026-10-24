import type { LottieColorSlot, LottieVariant } from "./types";

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
	defaultVariant?: string;
	variants?: LottieVariant[];
	/** Sound effects placed with the animation (see `addPackAnimation`). */
	sounds?: PackSoundCue[];
	files: Record<string, { sha256: string }>;
}

/** A sound effect that goes with a library animation. */
export interface PackSoundCue {
	id: string;
	/** Pack-relative path, e.g. "sounds/click.wav". */
	file: string;
	/** Seconds after the animation starts. */
	at: number;
	durationSec: number;
	gainDb?: number;
}

/**
 * Old asset ids that projects may still store, and what they are now.
 * `cta-tap-here` (a pointing hand) became `cta-mouse-click`.
 */
export const PACK_ASSET_ALIASES: Record<string, string> = {
	"cta-tap-here": "cta-mouse-click",
};

/** The asset an id refers to, following renames. */
export function lookupPackAsset<T extends { id: string }>(assets: T[], assetId: string): T | null {
	const id = assetId in PACK_ASSET_ALIASES ? PACK_ASSET_ALIASES[assetId] : assetId;
	return assets.find((asset) => asset.id === id) ?? assets.find((asset) => asset.id === assetId) ?? null;
}

export function packSoundUrl(cue: Pick<PackSoundCue, "file">): string {
	return `${PACK_BASE_URL}/${cue.file}`;
}

/** Where each of an animation's sounds goes when the animation starts at `startSeconds`. */
export function packSoundPlacements({
	asset,
	startSeconds,
}: {
	asset: Pick<PackIndexAsset, "name" | "sounds">;
	startSeconds: number;
}): Array<{ name: string; url: string; startSeconds: number; durationSec: number; volumeDb?: number }> {
	return (asset.sounds ?? []).map((cue) => ({
		name: `${asset.name} — ${cue.id}`,
		url: packSoundUrl(cue),
		startSeconds: startSeconds + cue.at,
		durationSec: cue.durationSec,
		...(cue.gainDb !== undefined ? { volumeDb: cue.gainDb } : {}),
	}));
}

export interface PackIndex {
	schema: 1;
	name: string;
	license: string;
	/** `group` (optional) shows related categories together under one heading. */
	categories: Array<{ id: string; name: string; group?: string; count: number }>;
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
	return lookupPackAsset(index.assets, assetId);
}

/** The variant actually used: `variant` when the asset has it, else its default (or none). */
export function resolvePackVariant(
	asset: Pick<PackIndexAsset, "variants" | "defaultVariant">,
	variant?: string | null,
): string | undefined {
	if (!asset.variants?.length) return undefined;
	if (variant && asset.variants.some((v) => v.id === variant)) return variant;
	return asset.defaultVariant ?? asset.variants[0].id;
}

/** File suffix of a non-default variant ("" for the default). */
function variantSuffix(asset: Pick<PackIndexAsset, "variants" | "defaultVariant">, variant?: string | null): string {
	const id = resolvePackVariant(asset, variant);
	return id && id !== (asset.defaultVariant ?? asset.variants?.[0]?.id) ? `.${id}` : "";
}

export function packAssetJsonUrl(
	asset: Pick<PackIndexAsset, "id" | "path" | "variants" | "defaultVariant">,
	variant?: string | null,
): string {
	return `${PACK_BASE_URL}/${asset.path}/${asset.id}${variantSuffix(asset, variant)}.json`;
}

export function packAssetThumbnailUrl(
	asset: Pick<PackIndexAsset, "path" | "variants" | "defaultVariant">,
	variant?: string | null,
): string {
	return `${PACK_BASE_URL}/${asset.path}/thumbnail${variantSuffix(asset, variant)}.png`;
}

/** Languages across the library, in first-seen order. */
export function packLanguages(assets: PackIndexAsset[]): LottieVariant[] {
	const seen = new Map<string, LottieVariant>();
	for (const asset of assets) for (const v of asset.variants ?? []) if (!seen.has(v.id)) seen.set(v.id, v);
	return [...seen.values()];
}

/** Matches by name, id, category or tag; every word must match something. */
export function searchPackAssets({
	assets,
	query,
	category,
	language,
}: {
	assets: PackIndexAsset[];
	query: string;
	category?: string | null;
	/** Only assets that come in this language variant. */
	language?: string | null;
}): PackIndexAsset[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return assets.filter((asset) => {
		if (category && asset.category !== category) return false;
		if (language && !asset.variants?.some((v) => v.id === language)) return false;
		if (words.length === 0) return true;
		const haystack = [asset.name, asset.id, asset.category, ...asset.tags, ...(asset.variants ?? []).map((v) => v.name)].join(" ").toLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}

/** Categories in library order, ungrouped first, then each group under its heading. */
export function groupPackCategories(categories: PackIndex["categories"]): Array<{ group: string | null; categories: PackIndex["categories"] }> {
	const out: Array<{ group: string | null; categories: PackIndex["categories"] }> = [];
	for (const category of categories) {
		const group = category.group ?? null;
		const existing = out.find((g) => g.group === group);
		if (existing) existing.categories.push(category);
		else out.push({ group, categories: [category] });
	}
	return out.sort((a, b) => Number(a.group !== null) - Number(b.group !== null));
}
