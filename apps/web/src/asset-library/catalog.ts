import type { AssetStoreState, CatalogPack, MissingPacksPolicy, PackAssetRef, PackStatus, PackType } from "./types";

/*
 * Asset Library logic with no React or Electron: pack status, search,
 * asset references and what to do about packs a project needs.
 */

export const ASSET_SCHEME = "wsc-asset";

/** Where an installed pack's files are served (Electron's wsc-asset:// protocol). */
export function installedPackBase(packId: string, version: string): string {
	return `${ASSET_SCHEME}://${packId}/${version}`;
}

/** -1, 0 or 1; pre-releases sort before their release. */
export function compareSemver(a: string, b: string): number {
	const parse = (v: string) => {
		const [core, pre] = v.replace(/^v/, "").split("-", 2);
		return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
	};
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < 3; i++) if ((x.nums[i] ?? 0) !== (y.nums[i] ?? 0)) return (x.nums[i] ?? 0) > (y.nums[i] ?? 0) ? 1 : -1;
	if (x.pre === y.pre) return 0;
	if (x.pre === null) return 1;
	if (y.pre === null) return -1;
	return x.pre > y.pre ? 1 : -1;
}

export function packStatus(pack: Pick<CatalogPack, "id" | "version">, state: Pick<AssetStoreState, "installed" | "builtin" | "downloads">): PackStatus {
	const download = state.downloads[pack.id];
	if (download && download.status !== "cancelled") return download.status === "error" ? "error" : download.status;
	const installed = state.installed[pack.id];
	if (installed) return compareSemver(pack.version, installed.version) > 0 ? "update-available" : "installed";
	if (state.builtin.some((b) => b.id === pack.id)) return "builtin";
	return "not-installed";
}

export const STATUS_LABELS: Record<PackStatus, string> = {
	builtin: "Installed (built-in)",
	installed: "Installed",
	"update-available": "Update available",
	downloading: "Downloading",
	paused: "Paused",
	installing: "Installing",
	error: "Failed",
	"not-installed": "Get",
};

/** Packs to show: the catalog, plus built-in packs when the catalog can't be reached. */
export function libraryPacks(state: Pick<AssetStoreState, "catalog" | "builtin">): CatalogPack[] {
	const packs = [...(state.catalog?.packs ?? [])];
	for (const builtin of state.builtin) {
		if (packs.some((p) => p.id === builtin.id)) continue;
		packs.push({
			id: builtin.id,
			type: builtin.type,
			version: "0.0.0",
			title: builtin.title,
			description: "Comes with FrameFlow and works offline.",
			tags: {},
			languages: [],
			sizeBytes: 1,
			sha256: "",
			licence: "MIT",
			minAppVersion: "0.0.0",
			thumbnailUrl: null,
			previewUrl: null,
			files: "",
			plan: "free",
			builtin: true,
		});
	}
	return packs;
}

/**
 * Packs matching every word of `query` in their title, description, id or
 * tags in any language (English, Sinhala, Tamil), with optional filters.
 */
export function searchPacks({
	packs,
	query,
	type,
	language,
	statusFilter,
	state,
	favorites = [],
}: {
	packs: CatalogPack[];
	query: string;
	type?: PackType | null;
	language?: string | null;
	statusFilter?: "installed" | "updates" | "favorites" | null;
	state?: Pick<AssetStoreState, "installed" | "builtin" | "downloads">;
	/** Favorite pack ids (statusFilter "favorites"). */
	favorites?: string[];
}): CatalogPack[] {
	const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return packs.filter((pack) => {
		if (type && pack.type !== type) return false;
		if (language && !pack.languages.includes(language)) return false;
		if (statusFilter === "favorites" && !favorites.includes(pack.id)) return false;
		if (statusFilter && state) {
			const status = packStatus(pack, state);
			if (statusFilter === "installed" && !["installed", "builtin", "update-available"].includes(status)) return false;
			if (statusFilter === "updates" && status !== "update-available") return false;
		}
		if (!words.length) return true;
		const haystack = [pack.title, pack.description, pack.id, ...(pack.tags.en ?? []), ...(pack.tags.si ?? []), ...(pack.tags.ta ?? [])]
			.join(" ")
			.toLocaleLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ---------- references ----------

const REF = /^([a-z0-9][a-z0-9-]{0,63})@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/(.+)$/;

/** `packId@version/assetId` → parts, or null. */
export function parseAssetRef(ref: string): PackAssetRef | null {
	const match = REF.exec(ref);
	return match ? { packId: match[1], version: match[2], assetId: match[3] } : null;
}

export function formatAssetRef(ref: PackAssetRef): string {
	return `${ref.packId}@${ref.version}/${ref.assetId}`;
}

/** The catalog pack that holds an asset id (newest first), if any. */
export function packForAsset(packs: CatalogPack[], assetId: string): CatalogPack | null {
	return [...packs].sort((a, b) => compareSemver(b.version, a.version)).find((p) => p.assetIds?.includes(assetId)) ?? null;
}

// ---------- packs a project needs ----------

/** Pack references a project's clips use (lottie sources with a pack). */
export function projectPackRefs(elements: Array<{ lottie?: { source?: { kind: string; pack?: { id: string; version: string }; assetId?: string } } }>): PackAssetRef[] {
	const refs: PackAssetRef[] = [];
	for (const element of elements) {
		const source = element.lottie?.source;
		if (source?.kind === "pack" && source.pack && source.assetId) refs.push({ packId: source.pack.id, version: source.pack.version, assetId: source.assetId });
	}
	return refs;
}

/**
 * Packs a project needs that aren't on this device. A newer installed
 * version satisfies an older reference (overrides carry across versions);
 * built-in packs always satisfy theirs.
 */
export function missingPacks(refs: PackAssetRef[], state: Pick<AssetStoreState, "installed" | "builtin">): string[] {
	const missing = new Set<string>();
	for (const ref of refs) {
		if (state.builtin.some((b) => b.id === ref.packId)) continue;
		const installed = state.installed[ref.packId];
		if (installed && compareSemver(installed.version, ref.version) >= 0) continue;
		missing.add(ref.packId);
	}
	return [...missing];
}

/**
 * What to do with missing packs: install now (auto), ask the user first,
 * or leave placeholders (never, offline, or metered when Wi-Fi only).
 */
export function planMissingPacks({
	missing,
	policy,
	online,
	metered,
	unmeteredOnly,
	catalog,
}: {
	missing: string[];
	policy: MissingPacksPolicy;
	online: boolean;
	metered: boolean;
	unmeteredOnly: boolean;
	catalog: CatalogPack[];
}): { install: string[]; ask: string[]; placeholder: string[] } {
	const available = missing.filter((id) => catalog.some((p) => p.id === id));
	const unavailable = missing.filter((id) => !available.includes(id));
	if (!online || policy === "never" || available.length === 0) return { install: [], ask: [], placeholder: missing };
	if (policy === "ask" || (unmeteredOnly && metered)) return { install: [], ask: available, placeholder: unavailable };
	return { install: available, ask: [], placeholder: unavailable };
}

/** Best-effort metered check (Chromium's Network Information API). */
export function isMeteredConnection(nav: { connection?: { saveData?: boolean; type?: string; effectiveType?: string } } | undefined): boolean {
	const connection = nav?.connection;
	if (!connection) return false;
	if (connection.saveData) return true;
	return connection.type === "cellular";
}
