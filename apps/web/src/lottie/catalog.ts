import type { LottieColorSlot, LottieImageSlot, LottieTextSlot, LottieVariant } from "./types";

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
	/** Motion Editor slots (words and pictures the user can replace). */
	textSlots?: LottieTextSlot[];
	imageSlots?: LottieImageSlot[];
	files: Record<string, { sha256: string }>;
	/** Where its pack is served from; the bundled pack when absent. */
	base?: string;
	/** The download-center pack it was installed from; absent for built-in assets. */
	pack?: { id: string; version: string };
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

export function packSoundUrl(cue: Pick<PackSoundCue, "file">, base: string = PACK_BASE_URL): string {
	return `${base}/${cue.file}`;
}

/** Where each of an animation's sounds goes when the animation starts at `startSeconds`. */
export function packSoundPlacements({
	asset,
	startSeconds,
}: {
	asset: Pick<PackIndexAsset, "name" | "sounds" | "base">;
	startSeconds: number;
}): Array<{ name: string; url: string; startSeconds: number; durationSec: number; volumeDb?: number }> {
	return (asset.sounds ?? []).map((cue) => ({
		name: `${asset.name} — ${cue.id}`,
		url: packSoundUrl(cue, asset.base),
		startSeconds: startSeconds + cue.at,
		durationSec: cue.durationSec,
		...(cue.gainDb !== undefined ? { volumeDb: cue.gainDb } : {}),
	}));
}

export interface PackIndex {
	schema: 1;
	name: string;
	license: string;
	categories: Array<{ id: string; name: string; count: number }>;
	assets: PackIndexAsset[];
}

let indexPromise: Promise<PackIndex> | null = null;

function loadBundledIndex(): Promise<PackIndex> {
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

/** Motion packs installed from the download center, by pack id. */
const installedPacks = new Map<string, { version: string; base: string; index: PackIndex }>();
const packListeners = new Set<() => void>();
let epoch = 0;
/** Bumps whenever installed packs change, so rendered frames can be redrawn. */
export const motionPacksEpoch = () => epoch;

/**
 * Adds an installed motion pack to the Animations library (its assets get
 * `base` and `pack`). Registering the same pack again replaces it.
 */
export function registerMotionPack({
	packId,
	version,
	base,
	index,
}: {
	packId: string;
	version: string;
	base: string;
	index: PackIndex;
}) {
	installedPacks.set(packId, {
		version,
		base,
		index: { ...index, assets: index.assets.map((asset) => ({ ...asset, base, pack: { id: packId, version } })) },
	});
	epoch++;
	for (const listener of packListeners) listener();
}

export function unregisterMotionPack(packId: string) {
	if (!installedPacks.delete(packId)) return;
	epoch++;
	for (const listener of packListeners) listener();
}

export function isMotionPackRegistered(packId: string, version?: string): boolean {
	const entry = installedPacks.get(packId);
	return !!entry && (!version || entry.version === version);
}

/** Called when installed packs change (the library re-reads its index). */
export function onMotionPacksChange(listener: () => void): () => void {
	packListeners.add(listener);
	return () => packListeners.delete(listener);
}

/** A pack-qualified asset whose pack isn't installed (yet). */
export class MissingPackError extends Error {
	constructor(
		readonly packId: string,
		readonly version: string,
		readonly assetId: string,
	) {
		super(`Pack "${packId}" isn't installed`);
		this.name = "MissingPackError";
	}
}

/**
 * The bundled pack plus installed motion packs. Built-in assets come first,
 * so an unqualified asset id always means the built-in copy.
 */
export async function loadPackIndex(): Promise<PackIndex> {
	const bundled = await loadBundledIndex();
	if (installedPacks.size === 0) return bundled;
	const seen = new Set(bundled.assets.map((a) => a.id));
	const extra: PackIndexAsset[] = [];
	const categories = [...bundled.categories];
	for (const { index } of installedPacks.values()) {
		for (const c of index.categories) if (!categories.some((x) => x.id === c.id)) categories.push(c);
		for (const asset of index.assets) if (!seen.has(asset.id)) extra.push(asset);
	}
	return { ...bundled, categories, assets: [...bundled.assets, ...extra] };
}

/**
 * Finds an asset. With `pack`, it must come from that installed pack
 * (any version: overrides survive pack updates); the built-in packs answer
 * for their own ids, so projects made with the bundled copy keep working.
 */
export async function findPackAsset(assetId: string, pack?: { id: string; version: string }): Promise<PackIndexAsset | null> {
	if (pack) {
		const installed = installedPacks.get(pack.id);
		if (installed) {
			const found = lookupPackAsset(installed.index.assets, assetId);
			if (found) return found;
		}
		if (BUILTIN_PACK_IDS.has(pack.id)) {
			const bundled = await loadBundledIndex().then((index) => lookupPackAsset(index.assets, assetId)).catch(() => null);
			if (bundled) return bundled;
		}
		throw new MissingPackError(pack.id, pack.version, assetId);
	}
	const index = await loadPackIndex();
	return lookupPackAsset(index.assets, assetId);
}

/** Download-center packs that are also bundled with the app. */
export const BUILTIN_PACK_IDS = new Set(["worksuite-essentials", "subscribe-buttons", "worksuite-sfx"]);

/** The built-in pack a bundled asset belongs to (by category). */
export function builtinPackOf(asset: Pick<PackIndexAsset, "category">): string {
	return asset.category === "subscribe-buttons" ? "subscribe-buttons" : "worksuite-essentials";
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
	asset: Pick<PackIndexAsset, "id" | "path" | "variants" | "defaultVariant" | "base">,
	variant?: string | null,
): string {
	return `${asset.base ?? PACK_BASE_URL}/${asset.path}/${asset.id}${variantSuffix(asset, variant)}.json`;
}

export function packAssetThumbnailUrl(
	asset: Pick<PackIndexAsset, "path" | "variants" | "defaultVariant" | "base">,
	variant?: string | null,
): string {
	return `${asset.base ?? PACK_BASE_URL}/${asset.path}/thumbnail${variantSuffix(asset, variant)}.png`;
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
