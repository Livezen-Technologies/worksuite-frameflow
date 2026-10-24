/** Pack types in the download center (catalog.json → packs[].type). */
export const PACK_TYPES = [
	"motion",
	"text-templates",
	"video-templates",
	"sounds",
	"transitions",
	"effects",
	"filters",
	"color-profiles",
	"luts",
	"fonts",
	"graphics",
	"stickers",
	"brand-kits",
] as const;
export type PackType = (typeof PACK_TYPES)[number];

export const PACK_TYPE_LABELS: Record<PackType, string> = {
	motion: "Motion graphics",
	"text-templates": "Text templates",
	"video-templates": "Video templates",
	sounds: "Sounds",
	transitions: "Transitions",
	effects: "Effects",
	filters: "Filters",
	"color-profiles": "Colour profiles",
	luts: "LUTs",
	fonts: "Fonts",
	graphics: "Graphics & overlays",
	stickers: "GIFs & stickers",
	"brand-kits": "Brand kits",
};

/** One pack in catalog.json (see assets/packs/catalog.schema.json). */
export interface CatalogPack {
	id: string;
	type: PackType;
	version: string;
	title: string;
	description: string;
	tags: { en?: string[]; si?: string[]; ta?: string[] };
	languages: string[];
	sizeBytes: number;
	sha256: string;
	licence: string;
	minAppVersion: string;
	thumbnailUrl: string | null;
	previewUrl: string | null;
	/** Zip URL, absolute or relative to catalog.json. */
	files: string;
	plan: "free" | "pro";
	assetCount?: number;
	assetIds?: string[];
	/** Also bundled with the app. */
	builtin?: boolean;
}

export interface AssetCatalog {
	schema: 1;
	channel: "stable" | "beta";
	generatedAt?: string;
	packs: CatalogPack[];
}

export interface InstalledPack {
	id: string;
	type: PackType;
	title: string;
	version: string;
	sizeBytes: number;
	installedAt: number;
	previousVersion: string | null;
}

export interface BuiltinPack {
	id: string;
	type: PackType;
	title: string;
	version: "builtin";
}

export interface PackDownload {
	status: "downloading" | "paused" | "installing" | "error" | "cancelled";
	received: number;
	total: number;
	version: string;
	error: string | null;
}

export type MissingPacksPolicy = "auto" | "ask" | "never";

export interface AssetLibrarySettings {
	channel: "stable" | "beta";
	missingPacks: MissingPacksPolicy;
	autoUpdate: boolean;
	starterPacks: boolean;
	unmeteredOnly: boolean;
	storageLimitBytes: number;
}

/** What the desktop asset store reports (window.worksuite.assets). */
export interface AssetStoreState {
	settings: AssetLibrarySettings;
	catalog: AssetCatalog | null;
	catalogStatus: { state: "idle" | "checking" | "ready" | "error"; error: string | null; code?: string; fetchedAt: number | null; stale: boolean };
	installed: Record<string, InstalledPack>;
	builtin: BuiltinPack[];
	downloads: Record<string, PackDownload>;
}

export interface WorksuiteAssetsBridge {
	getState: () => Promise<AssetStoreState>;
	refresh: () => Promise<AssetStoreState>;
	install: (packId: string) => Promise<AssetStoreState>;
	pause: (packId: string) => Promise<AssetStoreState>;
	resume: (packId: string) => Promise<AssetStoreState>;
	cancel: (packId: string) => Promise<AssetStoreState>;
	uninstall: (packId: string) => Promise<AssetStoreState>;
	clearUnused: () => Promise<AssetStoreState & { freedBytes: number }>;
	diskUsage: () => Promise<{ packs: number; total: number }>;
	configure: (settings: Partial<AssetLibrarySettings>) => Promise<AssetStoreState>;
	updateAll: () => Promise<Array<{ id: string; ok: boolean; error?: string }>>;
	onChange: (listener: (state: AssetStoreState) => void) => () => void;
}

/** A pack's state in the library UI. */
export type PackStatus =
	| "builtin"
	| "installed"
	| "update-available"
	| "downloading"
	| "paused"
	| "installing"
	| "error"
	| "not-installed";

/** A reference to one asset of a download-center pack, as projects store it. */
export interface PackAssetRef {
	packId: string;
	version: string;
	assetId: string;
}
