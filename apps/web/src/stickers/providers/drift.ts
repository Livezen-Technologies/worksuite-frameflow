import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

/** Animated Lottie stickers from the Drift asset pack (CC BY-NC-SA 4.0). */
export const DRIFT_PROVIDER_ID = "drift";

const DRIFT_BASE_URL = "/stickers/drift";

export type DriftPlayback = "loop" | "intro-hold" | "intro-hold-outro";

export interface DriftAsset {
	id: string;
	name: string;
	category: string;
	tags: string[];
	width: number;
	height: number;
	fps: number;
	frames: number;
	playback: DriftPlayback;
	/** [start, end] seconds of the intro and outro, for intro-hold-outro. */
	intro?: [number, number];
	outro?: [number, number];
}

const CATEGORY_TITLES: Record<string, string> = {
	"app-ui": "App UI",
	broadcast: "Broadcast",
	"call-to-action": "Call to action",
	callouts: "Callouts",
	devices: "Devices",
	gaming: "Gaming",
	infographics: "Infographics",
	"lower-thirds": "Lower thirds",
	memes: "Memes",
	reactions: "Reactions",
	seasonal: "Seasonal",
	"status-icons": "Status icons",
	transitions: "Transitions",
};

let catalogPromise: Promise<DriftAsset[]> | null = null;

/** The catalog is ~300 KB, so it loads on first use rather than with the app. */
export function loadDriftCatalog(): Promise<DriftAsset[]> {
	catalogPromise ??= import("./drift-catalog.json").then(
		(module) => module.default as DriftAsset[],
	);
	return catalogPromise;
}

export function isDriftStickerId(stickerId: string): boolean {
	return stickerId.startsWith(`${DRIFT_PROVIDER_ID}:`);
}

export async function getDriftAsset({
	stickerId,
}: {
	stickerId: string;
}): Promise<DriftAsset | null> {
	if (!isDriftStickerId(stickerId)) return null;
	const { providerValue } = parseStickerId({ stickerId });
	const catalog = await loadDriftCatalog();
	return catalog.find((asset) => asset.id === providerValue) ?? null;
}

export function driftAnimationUrl({ assetId }: { assetId: string }): string {
	return `${DRIFT_BASE_URL}/${assetId}.json`;
}

function toStickerItem({ asset }: { asset: DriftAsset }): StickerItem {
	return {
		id: buildStickerId({ providerId: DRIFT_PROVIDER_ID, providerValue: asset.id }),
		provider: DRIFT_PROVIDER_ID,
		name: asset.name,
		previewUrl: `${DRIFT_BASE_URL}/${asset.id}.png`,
		metadata: { category: asset.category, animated: true },
	};
}

export function matchesDriftQuery({
	asset,
	query,
}: {
	asset: DriftAsset;
	query: string;
}): boolean {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const haystack = [asset.name, asset.category, ...asset.tags]
		.join(" ")
		.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

export const driftProvider: StickerProvider = {
	id: DRIFT_PROVIDER_ID,
	async search({ query, options }): Promise<StickerSearchResult> {
		const catalog = await loadDriftCatalog();
		const matches = catalog.filter((asset) => matchesDriftQuery({ asset, query }));
		const limit = options?.limit ?? matches.length;
		return {
			items: matches.slice(0, limit).map((asset) => toStickerItem({ asset })),
			total: matches.length,
			hasMore: matches.length > limit,
		};
	},
	async browse({ options }): Promise<StickerBrowseResult> {
		const catalog = await loadDriftCatalog();
		const byCategory = new Map<string, DriftAsset[]>();
		for (const asset of catalog) {
			const assets = byCategory.get(asset.category) ?? [];
			assets.push(asset);
			byCategory.set(asset.category, assets);
		}
		const limit = options?.limit;
		return {
			sections: [...byCategory].map(([category, assets]) => ({
				id: category,
				title: CATEGORY_TITLES[category] ?? category,
				items: (limit ? assets.slice(0, limit) : assets).map((asset) =>
					toStickerItem({ asset }),
				),
				hasMore: limit ? assets.length > limit : false,
				layout: "grid",
			})),
		};
	},
	resolveUrl({ stickerId }): string {
		const { providerValue } = parseStickerId({ stickerId });
		return `${DRIFT_BASE_URL}/${providerValue}.png`;
	},
};
