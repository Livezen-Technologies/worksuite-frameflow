"use client";

import { useMemo, useState } from "react";
import {
	formatBytes,
	libraryPacks,
	packStatus,
	searchPacks,
	STATUS_LABELS,
} from "../catalog";
import {
	type AssetLibrarySettings,
	type AssetStoreState,
	type CatalogPack,
	PACK_TYPE_LABELS,
	PACK_TYPES,
	type PackStatus,
	type PackType,
} from "../types";
import { OVERLAY_CSS } from "./styles";

export interface AssetLibraryActions {
	install: (packId: string) => void;
	pause: (packId: string) => void;
	resume: (packId: string) => void;
	cancel: (packId: string) => void;
	uninstall: (packId: string) => void;
	refresh: () => void;
	clearUnused: () => void;
	configure: (patch: Partial<AssetLibrarySettings>) => void;
	/** Adds one asset of a pack to the timeline (placeholder while downloading). */
	addAsset?: (pack: CatalogPack, assetId: string) => void;
}

const LANGUAGES = [
	{ id: "en", name: "English" },
	{ id: "si", name: "සිංහල" },
	{ id: "ta", name: "தமிழ்" },
];

const BADGE_CLASS: Partial<Record<PackStatus, string>> = {
	installed: "installed",
	builtin: "builtin",
	"update-available": "update",
	error: "error",
};

/** Resolves catalog-relative URLs (thumbnails) against the catalog location. */
function resolveUrl(url: string | null, base?: string): string | null {
	if (!url) return null;
	try {
		return base ? new URL(url, base).toString() : url;
	} catch {
		return url;
	}
}

/**
 * The full-screen Asset Library: tabs per pack type, search in English,
 * Sinhala or Tamil, language and status filters, pack details with
 * install progress, and download settings.
 */
export function AssetLibraryView({
	state,
	actions,
	onClose,
	catalogBase,
	initialType = null,
	desktop = true,
}: {
	state: AssetStoreState;
	actions: AssetLibraryActions;
	onClose: () => void;
	/** Base URL catalog-relative thumbnail paths resolve against. */
	catalogBase?: string;
	initialType?: PackType | null;
	/** False in the browser build: packs can't be downloaded there. */
	desktop?: boolean;
}) {
	const [type, setType] = useState<PackType | null>(initialType);
	const [query, setQuery] = useState("");
	const [language, setLanguage] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<"installed" | "updates" | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);

	const packs = useMemo(() => libraryPacks(state), [state]);
	const counts = useMemo(() => {
		const map = new Map<PackType, number>();
		for (const p of packs) map.set(p.type, (map.get(p.type) ?? 0) + 1);
		return map;
	}, [packs]);
	const visible = useMemo(
		() => searchPacks({ packs, query, type, language, statusFilter, state }),
		[packs, query, type, language, statusFilter, state],
	);
	const selected = packs.find((p) => p.id === selectedId) ?? visible[0] ?? null;
	const updates = packs.filter((p) => packStatus(p, state) === "update-available").length;
	const status = state.catalogStatus;

	return (
		<div className="al-root" role="dialog" aria-label="Asset Library">
			<style>{OVERLAY_CSS}</style>
			<div className="al-head">
				<span className="al-title">Asset Library</span>
				<input
					className="al-search"
					placeholder="Search packs — English, සිංහල, தமிழ்"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label="Search packs"
				/>
				<button type="button" className="al-btn" onClick={actions.refresh} disabled={status.state === "checking"}>
					{status.state === "checking" ? "Checking…" : "Check for packs"}
				</button>
				<button type="button" className="al-btn" aria-pressed={showSettings} onClick={() => setShowSettings((v) => !v)}>
					Settings
				</button>
				<button type="button" className="al-btn ghost al-close" onClick={onClose} aria-label="Close">
					Close ✕
				</button>
			</div>
			<div className="al-tabs" role="tablist">
				<button type="button" role="tab" className="al-tab" aria-selected={type === null} onClick={() => setType(null)}>
					All<span className="n">{packs.length}</span>
				</button>
				{PACK_TYPES.map((t) => (
					<button key={t} type="button" role="tab" className="al-tab" aria-selected={type === t} onClick={() => setType(t)}>
						{PACK_TYPE_LABELS[t]}
						<span className="n">{counts.get(t) ?? 0}</span>
					</button>
				))}
			</div>
			{!desktop && <div className="al-banner">Downloading packs needs the FrameFlow desktop app. Built-in packs work everywhere.</div>}
			{status.state === "error" && (
				<div className="al-banner error">
					{status.code === "bad-signature"
						? "The download center's catalog failed its signature check, so it was ignored. Built-in packs still work."
						: `Couldn't reach the download center (${status.error}). Built-in packs still work.`}
				</div>
			)}
			{status.stale && <div className="al-banner">Offline — showing the packs from your last check.</div>}
			<div className="al-body">
				<div className="al-main">
					<div className="al-filters">
						<button type="button" className="al-chip" aria-pressed={statusFilter === null} onClick={() => setStatusFilter(null)}>
							All packs
						</button>
						<button type="button" className="al-chip" aria-pressed={statusFilter === "installed"} onClick={() => setStatusFilter("installed")}>
							Installed
						</button>
						<button type="button" className="al-chip" aria-pressed={statusFilter === "updates"} onClick={() => setStatusFilter("updates")}>
							Updates{updates ? ` (${updates})` : ""}
						</button>
						<span className="al-sep" />
						{LANGUAGES.map((l) => (
							<button
								key={l.id}
								type="button"
								className="al-chip"
								lang={l.id}
								aria-pressed={language === l.id}
								onClick={() => setLanguage(language === l.id ? null : l.id)}
							>
								{l.name}
							</button>
						))}
					</div>
					{visible.length === 0 ? (
						<div className="al-empty">No packs match. Try another word or language.</div>
					) : (
						<div className="al-grid">
							{visible.map((pack) => (
								<PackCard
									key={pack.id}
									pack={pack}
									state={state}
									selected={selected?.id === pack.id}
									thumb={resolveUrl(pack.thumbnailUrl, catalogBase)}
									onSelect={() => setSelectedId(pack.id)}
								/>
							))}
						</div>
					)}
				</div>
				<aside className="al-side">
					{showSettings ? (
						<SettingsPanel state={state} actions={actions} />
					) : selected ? (
						<PackDetail pack={selected} state={state} actions={actions} desktop={desktop} preview={resolveUrl(selected.previewUrl ?? selected.thumbnailUrl, catalogBase)} />
					) : (
						<p>Select a pack to see what's inside.</p>
					)}
				</aside>
			</div>
		</div>
	);
}

function PackCard({ pack, state, selected, thumb, onSelect }: { pack: CatalogPack; state: AssetStoreState; selected: boolean; thumb: string | null; onSelect: () => void }) {
	const status = packStatus(pack, state);
	const download = state.downloads[pack.id];
	return (
		<button type="button" className="al-card" aria-current={selected} onClick={onSelect}>
			<div className="al-thumb">{thumb ? <img src={thumb} alt="" /> : <span className="ph">◆</span>}</div>
			<div className="al-card-body">
				<span className="al-card-title">{pack.title}</span>
				<div className="al-meta">
					<span className={`al-badge ${BADGE_CLASS[status] ?? ""}`}>{STATUS_LABELS[status]}</span>
					<span className={`al-badge ${pack.plan}`}>{pack.plan === "pro" ? "Pro" : "Free"}</span>
					<span>{PACK_TYPE_LABELS[pack.type]}</span>
					{!pack.builtin && <span>· {formatBytes(pack.sizeBytes)}</span>}
				</div>
				{download && (download.status === "downloading" || download.status === "paused") && (
					<div className="al-progress" aria-label="Download progress">
						<i style={{ width: `${Math.round((download.received / Math.max(1, download.total)) * 100)}%` }} />
					</div>
				)}
			</div>
		</button>
	);
}

function PackDetail({ pack, state, actions, preview, desktop }: { pack: CatalogPack; state: AssetStoreState; actions: AssetLibraryActions; preview: string | null; desktop: boolean }) {
	const status = packStatus(pack, state);
	const download = state.downloads[pack.id];
	const installed = state.installed[pack.id];
	const tags = [...(pack.tags.en ?? []), ...(pack.tags.si ?? []), ...(pack.tags.ta ?? [])];
	const pct = download ? Math.round((download.received / Math.max(1, download.total)) * 100) : 0;
	return (
		<>
			<div className="al-thumb al-preview">{preview ? <img src={preview} alt="" /> : <span className="ph">◆</span>}</div>
			<h3>{pack.title}</h3>
			<div className="al-meta">
				<span className={`al-badge ${BADGE_CLASS[status] ?? ""}`}>{STATUS_LABELS[status]}</span>
				<span className={`al-badge ${pack.plan}`}>{pack.plan === "pro" ? "Pro" : "Free"}</span>
				{pack.languages.map((l) => (
					<span key={l} className="al-badge">
						{l.toUpperCase()}
					</span>
				))}
			</div>
			<p>{pack.description}</p>
			<div className="al-row">
				{status === "not-installed" && (
					<button type="button" className="al-btn primary" disabled={!desktop} onClick={() => actions.install(pack.id)}>
						Install · {formatBytes(pack.sizeBytes)}
					</button>
				)}
				{status === "update-available" && (
					<button type="button" className="al-btn primary" onClick={() => actions.install(pack.id)}>
						Update to {pack.version}
					</button>
				)}
				{status === "downloading" && (
					<>
						<button type="button" className="al-btn" onClick={() => actions.pause(pack.id)}>
							Pause
						</button>
						<button type="button" className="al-btn ghost" onClick={() => actions.cancel(pack.id)}>
							Cancel
						</button>
					</>
				)}
				{(status === "paused" || status === "error") && (
					<>
						<button type="button" className="al-btn primary" onClick={() => actions.resume(pack.id)}>
							{status === "paused" ? "Resume" : "Retry"}
						</button>
						<button type="button" className="al-btn ghost" onClick={() => actions.cancel(pack.id)}>
							Cancel
						</button>
					</>
				)}
				{(status === "installed" || status === "update-available") && (
					<button type="button" className="al-btn ghost" onClick={() => actions.uninstall(pack.id)}>
						Uninstall
					</button>
				)}
				{status === "builtin" && <span className="al-badge builtin">Comes with FrameFlow · works offline</span>}
			</div>
			{download && (download.status === "downloading" || download.status === "paused" || download.status === "installing") && (
				<div>
					<div className="al-progress">
						<i style={{ width: `${pct}%` }} />
					</div>
					<div className="al-meta" style={{ marginTop: 4 }}>
						{download.status === "installing" ? "Checking and unpacking…" : `${formatBytes(download.received)} of ${formatBytes(download.total)} (${pct}%)`}
					</div>
				</div>
			)}
			{download?.error && <div className="al-banner error" style={{ margin: 0 }}>{download.error}</div>}
			<dl className="al-kv">
				<dt>Version</dt>
				<dd>{pack.builtin && !installed ? "Built in" : (installed?.version ?? pack.version)}</dd>
				<dt>Type</dt>
				<dd>{PACK_TYPE_LABELS[pack.type]}</dd>
				<dt>Licence</dt>
				<dd>{pack.licence}</dd>
				{pack.assetCount !== undefined && (
					<>
						<dt>Assets</dt>
						<dd>{pack.assetCount}</dd>
					</>
				)}
			</dl>
			{tags.length > 0 && (
				<div className="al-meta">
					{tags.slice(0, 14).map((t) => (
						<span key={t} className="al-badge">
							{t}
						</span>
					))}
				</div>
			)}
			{actions.addAsset && pack.assetIds && pack.assetIds.length > 0 && (
				<>
					<div className="me-group">In this pack</div>
					<div className="al-assets">
						{pack.assetIds.map((id) => (
							<div key={id} className="al-asset">
								<span>{id}</span>
								<button
									type="button"
									className="al-btn ghost"
									title={status === "not-installed" ? "Adds a placeholder now; the pack downloads and it fills in" : "Add at the playhead"}
									onClick={() => actions.addAsset?.(pack, id)}
								>
									+ Add
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</>
	);
}

function SettingsPanel({ state, actions }: { state: AssetStoreState; actions: AssetLibraryActions }) {
	const s = state.settings;
	const used = Object.values(state.installed).reduce((n, p) => n + p.sizeBytes, 0);
	return (
		<div className="al-settings">
			<h3>Download settings</h3>
			<label>
				Packs a project needs
				<select value={s.missingPacks} onChange={(e) => actions.configure({ missingPacks: e.target.value as AssetLibrarySettings["missingPacks"] })}>
					<option value="auto">Download automatically</option>
					<option value="ask">Ask first</option>
					<option value="never">Never (keep placeholders)</option>
				</select>
			</label>
			<label>
				Update installed packs automatically
				<input type="checkbox" checked={s.autoUpdate} onChange={(e) => actions.configure({ autoUpdate: e.target.checked })} />
			</label>
			<label>
				Starter packs on first launch
				<input type="checkbox" checked={s.starterPacks} onChange={(e) => actions.configure({ starterPacks: e.target.checked })} />
			</label>
			<label>
				Only on Wi-Fi / unmetered
				<input type="checkbox" checked={s.unmeteredOnly} onChange={(e) => actions.configure({ unmeteredOnly: e.target.checked })} />
			</label>
			<label>
				Channel
				<select value={s.channel} onChange={(e) => actions.configure({ channel: e.target.value as "stable" | "beta" })}>
					<option value="stable">Stable</option>
					<option value="beta">Beta</option>
				</select>
			</label>
			<label>
				Storage limit (GB, 0 = none)
				<input
					type="number"
					min={0}
					step={0.5}
					value={s.storageLimitBytes / 1024 ** 3}
					onChange={(e) => actions.configure({ storageLimitBytes: Math.max(0, Number(e.target.value)) * 1024 ** 3 })}
					style={{ width: 80 }}
				/>
			</label>
			<p style={{ marginTop: 10 }}>Installed packs use {formatBytes(used)}.</p>
			<div className="al-row" style={{ marginTop: 8 }}>
				<button type="button" className="al-btn" onClick={actions.clearUnused}>
					Clear unused
				</button>
			</div>
		</div>
	);
}
