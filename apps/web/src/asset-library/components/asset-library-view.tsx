"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
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
	type LibraryDownloadRow,
	PACK_TYPE_LABELS,
	PACK_TYPES,
	type PackStatus,
	type PackType,
} from "../types";
import { onPackContentChange, packSounds } from "../registry";
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
	/** Download & Add: installs (dependencies first), then the default add on the project and selection. */
	downloadAndAdd?: (pack: CatalogPack) => void;
	/** Starts dragging a pack (or one of its assets) onto the timeline. */
	beginDrag?: (args: {
		pack: CatalogPack;
		dataTransfer: DataTransfer;
		assetId?: string | null;
	}) => void;
	endDrag?: () => void;
	setFavorite?: (args: { packId: string; on: boolean }) => void;
	loadHistory?: (
		cursor?: string | null,
	) => Promise<{
		signedIn: boolean;
		data: LibraryDownloadRow[];
		next_cursor: string | null;
	}>;
	retryDevice?: () => void;
}

type T = ReturnType<typeof useT>;

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
	const [statusFilter, setStatusFilter] = useState<
		"mine" | "installed" | "updates" | "favorites" | null
	>(null);
	const [sort, setSort] = useState<"relevance" | "name" | "recent" | "size">(
		"relevance",
	);
	const [menu, setMenu] = useState<{
		pack: CatalogPack;
		x: number;
		y: number;
	} | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	useEffect(() => {
		if (!notice) return;
		const id = window.setTimeout(() => setNotice(null), 2600);
		return () => window.clearTimeout(id);
	}, [notice]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [side, setSide] = useState<"detail" | "settings" | "history">("detail");
	const [dragging, setDragging] = useState(false);
	const t = useT();
	const favoriteList = state.library?.favorites;
	const favorites = useMemo(() => favoriteList ?? [], [favoriteList]);
	const drag = actions.beginDrag
		? {
				start: ({
					pack,
					event,
					assetId,
				}: {
					pack: CatalogPack;
					event: React.DragEvent;
					assetId?: string | null;
				}) => {
					actions.beginDrag?.({
						pack,
						dataTransfer: event.dataTransfer,
						assetId,
					});
					// Let the drop reach the timeline under the library.
					setTimeout(() => setDragging(true), 0);
				},
				end: () => {
					setDragging(false);
					actions.endDrag?.();
				},
			}
		: null;

	const packs = useMemo(() => libraryPacks(state), [state]);
	const counts = useMemo(() => {
		const map = new Map<PackType, number>();
		for (const p of packs) map.set(p.type, (map.get(p.type) ?? 0) + 1);
		return map;
	}, [packs]);
	const [category, setCategory] = useState<string | null>(null);
	const searched = useMemo(
		() =>
			searchPacks({
				packs,
				query,
				type,
				language,
				statusFilter,
				state,
				favorites,
			}),
		[packs, query, type, language, statusFilter, state, favorites],
	);
	const categories = useMemo(
		() => packCategories(packs.filter((p) => type === null || p.type === type)),
		[packs, type],
	);
	const visible = useMemo(() => {
		const list = category
			? searched.filter((p) => categories.of(p).includes(category))
			: searched;
		if (sort === "relevance") return list;
		const at = (p: CatalogPack) =>
			state.installed[p.id]?.installedAt ?? (favorites.includes(p.id) ? 1 : 0);
		return [...list].sort((a, b) =>
			sort === "name"
				? a.title.localeCompare(b.title, undefined, { numeric: true })
				: sort === "size"
					? b.sizeBytes - a.sizeBytes
					: at(b) - at(a),
		);
	}, [searched, category, categories, sort, state.installed, favorites]);
	const mineCount = useMemo(
		() =>
			searchPacks({ packs, query: "", statusFilter: "mine", state, favorites })
				.length,
		[packs, state, favorites],
	);
	/** Runs a menu action and confirms it in a short notice. */
	const run = ({ label, fn }: { label: string; fn: () => void }) => {
		setMenu(null);
		fn();
		setNotice(label);
	};
	const selected = packs.find((p) => p.id === selectedId) ?? visible[0] ?? null;
	const updates = packs.filter(
		(p) => packStatus(p, state) === "update-available",
	).length;
	const status = state.catalogStatus;
	const library = state.library ?? null;
	const deviceError = library?.device.error ?? null;

	return (
		<div
			className={`al-root${dragging ? " al-dragging" : ""}`}
			role="dialog"
			aria-label={t("Asset Library")}
		>
			<style>{OVERLAY_CSS}</style>
			{menu && (
				<PackMenu
					pack={menu.pack}
					x={menu.x}
					y={menu.y}
					state={state}
					actions={actions}
					favorite={favorites.includes(menu.pack.id)}
					onClose={() => setMenu(null)}
					onDetails={() => {
						setMenu(null);
						setSelectedId(menu.pack.id);
						setSide("detail");
					}}
					run={run}
					t={t}
				/>
			)}
			{notice && (
				<div className="al-notice" role="status">
					{notice}
				</div>
			)}
			<div className="al-head">
				<span className="al-title">{t("Asset Library")}</span>
				<input
					className="al-search"
					placeholder={t("Search packs — English, සිංහල, தமிழ்")}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label={t("Search packs")}
				/>
				<button
					type="button"
					className="al-btn"
					onClick={actions.refresh}
					disabled={status.state === "checking"}
				>
					{status.state === "checking" ? t("Checking…") : t("Check for packs")}
				</button>
				{library?.live === "connected" && (
					<span
						className="al-live"
						title={t(
							"New and changed packs appear as soon as they're published.",
						)}
					>
						● {t("Live")}
					</span>
				)}
				{actions.loadHistory && (
					<button
						type="button"
						className="al-btn"
						aria-pressed={side === "history"}
						onClick={() =>
							setSide((v) => (v === "history" ? "detail" : "history"))
						}
					>
						{t("Download history")}
					</button>
				)}
				<button
					type="button"
					className="al-btn"
					aria-pressed={side === "settings"}
					onClick={() =>
						setSide((v) => (v === "settings" ? "detail" : "settings"))
					}
				>
					{t("Settings")}
				</button>
				<button
					type="button"
					className="al-btn ghost al-close"
					onClick={onClose}
					aria-label={t("Close")}
				>
					{t("Close")} ✕
				</button>
			</div>
			<div className="al-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					className="al-tab"
					aria-selected={type === null}
					onClick={() => {
						setType(null);
						setCategory(null);
					}}
				>
					{t("All")}
					<span className="n">{packs.length}</span>
				</button>
				{PACK_TYPES.map((pt) => (
					<button
						key={pt}
						type="button"
						role="tab"
						className="al-tab"
						aria-selected={type === pt}
						onClick={() => {
							setType(pt);
							setCategory(null);
						}}
					>
						{t(PACK_TYPE_LABELS[pt])}
						<span className="n">{counts.get(pt) ?? 0}</span>
					</button>
				))}
			</div>
			{!desktop && (
				<div className="al-banner">
					{t(
						"Downloading packs needs the FrameFlow desktop app. Built-in packs work everywhere.",
					)}
				</div>
			)}
			{deviceError && (
				<div
					className="al-banner error"
					role="alert"
					data-device-error={deviceError.code}
				>
					<strong>
						{deviceError.code === "DEVICE_LIMIT"
							? t("Device limit reached")
							: t("This device isn't registered")}
					</strong>{" "}
					{deviceError.code === "DEVICE_LIMIT"
						? deviceError.limit
							? t(
									"Your plan allows {limit} devices and they're all in use. Remove a device in Manage account, then try again.",
									{ limit: deviceError.limit },
								)
							: t(
									"Your plan's devices are all in use. Remove a device in Manage account, then try again.",
								)
						: deviceError.message}
					{actions.retryDevice && (
						<button
							type="button"
							className="al-btn ghost"
							onClick={actions.retryDevice}
						>
							{t("Try again")}
						</button>
					)}
				</div>
			)}
			{status.state === "error" && (
				<div className="al-banner error">
					{status.code === "bad-signature"
						? t(
								"The download center's catalog failed its signature check, so it was ignored. Built-in packs still work.",
							)
						: t(
								"Couldn't reach the download center ({error}). Built-in packs still work.",
								{ error: status.error ?? "" },
							)}
				</div>
			)}
			{status.stale && (
				<div className="al-banner">
					{t("Offline — showing the packs from your last check.")}
				</div>
			)}
			<div className="al-body">
				{categories.list.length > 1 && (
					<nav
						className="al-cats"
						aria-label={t("Categories")}
						data-al-categories
					>
						<button
							type="button"
							className="al-cat"
							aria-pressed={category === null}
							onClick={() => setCategory(null)}
						>
							<span>{t("All")}</span>
							<span className="al-cat-n">{categories.total}</span>
						</button>
						{categories.list.map(([name, n]) => (
							<button
								key={name}
								type="button"
								className="al-cat"
								aria-pressed={category === name}
								onClick={() => setCategory(category === name ? null : name)}
							>
								<span>{name}</span>
								<span className="al-cat-n">{n}</span>
							</button>
						))}
					</nav>
				)}
				<div className="al-main">
					<div className="al-filters">
						<button
							type="button"
							className="al-chip"
							aria-pressed={statusFilter === null}
							onClick={() => setStatusFilter(null)}
						>
							{t("All packs")}
						</button>
						<button
							type="button"
							className="al-chip"
							aria-pressed={statusFilter === "mine"}
							onClick={() => setStatusFilter("mine")}
							data-my-library
						>
							{t("My Library")}
							{mineCount ? ` (${mineCount})` : ""}
						</button>
						<button
							type="button"
							className="al-chip"
							aria-pressed={statusFilter === "installed"}
							onClick={() => setStatusFilter("installed")}
						>
							{t("Installed")}
						</button>
						<button
							type="button"
							className="al-chip"
							aria-pressed={statusFilter === "updates"}
							onClick={() => setStatusFilter("updates")}
						>
							{t("Updates")}
							{updates ? ` (${updates})` : ""}
						</button>
						{actions.setFavorite && (
							<button
								type="button"
								className="al-chip"
								aria-pressed={statusFilter === "favorites"}
								onClick={() => setStatusFilter("favorites")}
							>
								♥ {t("Favorites")}
								{favorites.length ? ` (${favorites.length})` : ""}
							</button>
						)}
						<span className="al-sep" />
						<select
							className="al-sort"
							value={sort}
							onChange={(e) => setSort(e.target.value as typeof sort)}
							aria-label={t("Sort")}
						>
							<option value="relevance">{t("Sort: Default")}</option>
							<option value="name">{t("Sort: Name")}</option>
							<option value="recent">{t("Sort: Recently installed")}</option>
							<option value="size">{t("Sort: Size")}</option>
						</select>
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
						<div className="al-empty">
							{statusFilter === "favorites"
								? t("No favorites yet. Tap ♡ on a pack to keep it here.")
								: statusFilter === "mine"
									? t("Packs you install or favorite show up here.")
									: t("No packs match. Try another word or language.")}
						</div>
					) : type === "sounds" ? (
						<SoundList
							packs={visible}
							state={state}
							actions={actions}
							selectedId={selected?.id ?? null}
							favorites={favorites}
							catalogBase={catalogBase}
							onSelect={(pack) => {
								setSelectedId(pack.id);
								setSide("detail");
							}}
							onMenu={({ pack, event }) => {
								event.preventDefault();
								setSelectedId(pack.id);
								setMenu({ pack, x: event.clientX, y: event.clientY });
							}}
							drag={drag}
							t={t}
						/>
					) : (
						<div className="al-grid">
							{visible.map((pack) => (
								<PackCard
									key={pack.id}
									pack={pack}
									state={state}
									selected={selected?.id === pack.id}
									thumb={resolveUrl(pack.thumbnailUrl, catalogBase)}
									hoverPreview={
										pack.previewUrl
											? resolveUrl(pack.previewUrl, catalogBase)
											: null
									}
									onSelect={() => {
										setSelectedId(pack.id);
										setSide("detail");
									}}
									onMenu={(event) => {
										event.preventDefault();
										setSelectedId(pack.id);
										setMenu({ pack, x: event.clientX, y: event.clientY });
									}}
									favorite={favorites.includes(pack.id)}
									onFavorite={
										actions.setFavorite
											? (on) => actions.setFavorite?.({ packId: pack.id, on })
											: undefined
									}
									drag={drag}
									t={t}
								/>
							))}
						</div>
					)}
				</div>
				<aside className="al-side">
					{side === "settings" ? (
						<SettingsPanel state={state} actions={actions} t={t} />
					) : side === "history" && actions.loadHistory ? (
						<HistoryPanel load={actions.loadHistory} packs={packs} t={t} />
					) : selected ? (
						<PackDetail
							pack={selected}
							state={state}
							actions={actions}
							desktop={desktop}
							preview={resolveUrl(
								selected.previewUrl ?? selected.thumbnailUrl,
								catalogBase,
							)}
							favorite={favorites.includes(selected.id)}
							drag={drag}
							t={t}
						/>
					) : (
						<p>{t("Select a pack to see what's inside.")}</p>
					)}
				</aside>
			</div>
		</div>
	);
}

interface DragHandlers {
	start: (args: {
		pack: CatalogPack;
		event: React.DragEvent;
		assetId?: string | null;
	}) => void;
	end: () => void;
}

function FavoriteButton({
	on,
	onChange,
	t,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
	t: T;
}) {
	return (
		<span
			role="button"
			tabIndex={0}
			className="al-heart"
			aria-pressed={on}
			aria-label={on ? t("Remove from favorites") : t("Add to favorites")}
			title={on ? t("Remove from favorites") : t("Add to favorites")}
			onClick={(e) => {
				e.stopPropagation();
				onChange(!on);
			}}
			onKeyDown={(e) => {
				if (e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				e.stopPropagation();
				onChange(!on);
			}}
		>
			{on ? "♥" : "♡"}
		</span>
	);
}

/**
 * Sounds as a list: play, title, waveform, size and Add. A sound that isn't
 * downloaded yet is fetched first (they're small), then plays.
 */
function SoundList({
	packs,
	state,
	actions,
	selectedId,
	favorites,
	catalogBase,
	onSelect,
	onMenu,
	drag,
	t,
}: {
	packs: CatalogPack[];
	state: AssetStoreState;
	actions: AssetLibraryActions;
	selectedId: string | null;
	favorites: string[];
	catalogBase?: string;
	onSelect: (pack: CatalogPack) => void;
	onMenu: (args: { pack: CatalogPack; event: React.MouseEvent }) => void;
	drag: DragHandlers | null;
	t: T;
}) {
	const [playing, setPlaying] = useState<string | null>(null);
	const [waiting, setWaiting] = useState<string | null>(null);
	const audio = useRef<HTMLAudioElement | null>(null);
	const stop = () => {
		audio.current?.pause();
		audio.current = null;
		setPlaying(null);
	};
	const start = (packId: string) => {
		const sound = packSounds().find((s) => s.packId === packId);
		if (!sound) return false;
		audio.current?.pause();
		const el = new Audio(sound.url);
		el.addEventListener("ended", () => setPlaying((p) => (p === packId ? null : p)));
		audio.current = el;
		void el.play().catch(() => setPlaying(null));
		setPlaying(packId);
		return true;
	};
	// Plays a sound as soon as its download finishes.
	useEffect(() => {
		if (!waiting) return;
		const tryPlay = () => {
			if (start(waiting)) setWaiting(null);
		};
		tryPlay();
		return onPackContentChange(tryPlay);
	}, [waiting]);
	useEffect(() => () => audio.current?.pause(), []);
	const toggle = (pack: CatalogPack) => {
		if (playing === pack.id || waiting === pack.id) {
			setWaiting(null);
			stop();
			return;
		}
		if (start(pack.id)) return;
		stop();
		setWaiting(pack.id);
		const status = packStatus(pack, state);
		if (status === "not-installed" || status === "error") actions.install(pack.id);
	};
	return (
		<div className="al-list" role="list" data-sound-list>
			{packs.map((pack) => {
				const status = packStatus(pack, state);
				const usable = status === "installed" || status === "builtin" || status === "update-available";
				const thumb = resolveUrl(pack.thumbnailUrl, catalogBase);
				const isPlaying = playing === pack.id;
				const isWaiting = waiting === pack.id;
				const favorite = favorites.includes(pack.id);
				return (
					<div
						key={pack.id}
						role="listitem"
						className="al-srow"
						aria-current={selectedId === pack.id}
						onContextMenu={(event) => onMenu({ pack, event })}
						draggable={!!drag}
						onDragStart={drag ? (event) => drag.start({ pack, event }) : undefined}
						onDragEnd={drag?.end}
					>
						<button
							type="button"
							className={`al-play${isPlaying ? " on" : ""}`}
							onClick={() => toggle(pack)}
							aria-label={isPlaying ? t("Stop") : t("Play")}
						>
							{isWaiting ? "…" : isPlaying ? "■" : "▶"}
						</button>
						<button type="button" className="al-srow-main" onClick={() => onSelect(pack)}>
							<span className="al-srow-title">{pack.title}</span>
							<span className="al-srow-sub">{(pack.tags.en ?? []).filter((x) => !["sfx", "sound", "worksuite"].includes(x)).slice(0, 3).join(" · ")}</span>
						</button>
						<span className="al-srow-wave">{thumb && <StillImage src={thumb} />}</span>
						<span className={`al-badge ${BADGE_CLASS[status] ?? ""}`}>{t(STATUS_LABELS[status])}</span>
						<span className="al-srow-size">{pack.builtin ? "" : formatBytes(pack.sizeBytes)}</span>
						{actions.setFavorite && (
							<button
								type="button"
								className="al-srow-fav"
								aria-pressed={favorite}
								aria-label={favorite ? t("Remove from favorites") : t("Add to favorites")}
								onClick={() => actions.setFavorite?.({ packId: pack.id, on: !favorite })}
							>
								{favorite ? "♥" : "♡"}
							</button>
						)}
						{actions.downloadAndAdd && (
							<button type="button" className="al-btn al-srow-add" onClick={() => actions.downloadAndAdd?.(pack)}>
								{usable ? t("+ Add") : t("Get & add")}
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}

/**
 * Shows only the first frame of an image. Sound waveforms are animated
 * pictures; a library of them all moving at once is distracting and slow.
 */
function StillImage({ src }: { src: string }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const img = new Image();
		img.decoding = "async";
		img.onload = () => {
			const c = canvas.current;
			if (cancelled || !c) return;
			c.width = img.naturalWidth || 320;
			c.height = img.naturalHeight || 64;
			c.getContext("2d")?.drawImage(img, 0, 0);
		};
		img.onerror = () => !cancelled && setFailed(true);
		img.src = src;
		return () => {
			cancelled = true;
		};
	}, [src]);
	if (failed) return <span className="ph">♪</span>;
	return <canvas ref={canvas} className="al-still" aria-hidden />;
}

const SAMPLE: Partial<Record<string, string>> = { si: "අආ ශ්‍රී", ta: "அஆ தமிழ்" };

/**
 * A pack's picture, loaded lazily. Without one (or if it fails to load)
 * fonts show a type sample and other packs a plain mark, never an empty box.
 */
function PackThumb({ src, pack, large = false }: { src: string | null; pack: CatalogPack; large?: boolean }) {
	const [failed, setFailed] = useState(false);
	if (src && !failed && pack.type === "sounds") return <StillImage src={src} />;
	if (src && !failed) {
		return <img src={src} alt="" draggable={false} loading={large ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
	}
	if (pack.type === "fonts" || pack.type === "text-templates" || pack.type === "text-animations") {
		const script = pack.languages.find((l) => SAMPLE[l]) ?? ((pack.tags.en ?? []).includes("sinhala") ? "si" : (pack.tags.en ?? []).includes("tamil") ? "ta" : null);
		return (
			<span className={`al-sample${large ? " large" : ""}`}>
				<span className="al-sample-main">{script ? SAMPLE[script] : "Aa Bb"}</span>
				<span className="al-sample-name">{pack.title}</span>
			</span>
		);
	}
	return <span className="ph">◆</span>;
}

/** Right-click menu on a pack card. */
function PackMenu({
	pack,
	x,
	y,
	state,
	actions,
	favorite,
	onClose,
	onDetails,
	run,
	t,
}: {
	pack: CatalogPack;
	x: number;
	y: number;
	state: AssetStoreState;
	actions: AssetLibraryActions;
	favorite: boolean;
	onClose: () => void;
	onDetails: () => void;
	run: (args: { label: string; fn: () => void }) => void;
	t: T;
}) {
	const [confirm, setConfirm] = useState(false);
	const status = packStatus(pack, state);
	const installed = status === "installed" || status === "update-available";
	const usable = installed || status === "builtin";
	const busy =
		status === "downloading" || status === "installing" || status === "paused";
	useEffect(() => {
		const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [onClose]);
	const left = Math.min(x, window.innerWidth - 240);
	const top = Math.min(y, window.innerHeight - 340);
	const item = ({
		label,
		onClick,
		danger = false,
	}: {
		label: string;
		onClick: () => void;
		danger?: boolean;
	}) => (
		<button
			type="button"
			role="menuitem"
			className={`al-menu-item${danger ? " danger" : ""}`}
			onClick={onClick}
		>
			{label}
		</button>
	);
	const firstAsset = pack.assetIds?.[0] ?? null;
	return (
		<>
			<button
				type="button"
				aria-label={t("Close")}
				className="al-menu-scrim"
				onClick={onClose}
				onContextMenu={(e) => {
					e.preventDefault();
					onClose();
				}}
			/>
			<div
				className="al-menu"
				role="menu"
				style={{ left, top }}
				data-pack-menu={pack.id}
			>
				<div className="al-menu-title">{pack.title}</div>
				{actions.downloadAndAdd &&
					item({
						label: usable
							? t("Add to timeline")
							: t("Download & add to timeline"),
						onClick: () =>
							run({
								label: usable
									? t("Added to the timeline")
									: t("Downloading — it will be added when ready"),
								fn: () => actions.downloadAndAdd?.(pack),
							}),
					})}
				{actions.addAsset &&
					firstAsset &&
					usable &&
					item({
						label: t("Add to project"),
						onClick: () =>
							run({
								label: t("Added to the project"),
								fn: () => actions.addAsset?.(pack, firstAsset),
							}),
					})}
				<div className="al-menu-sep" />
				{status === "not-installed" &&
					item({
						label: t("Install"),
						onClick: () =>
							run({
								label: t("Installing {title}…", { title: pack.title }),
								fn: () => actions.install(pack.id),
							}),
					})}
				{status === "update-available" &&
					item({
						label: t("Update"),
						onClick: () =>
							run({
								label: t("Updating {title}…", { title: pack.title }),
								fn: () => actions.install(pack.id),
							}),
					})}
				{status === "error" &&
					item({
						label: t("Try again"),
						onClick: () =>
							run({
								label: t("Retrying…"),
								fn: () => actions.install(pack.id),
							}),
					})}
				{status === "downloading" &&
					item({
						label: t("Pause download"),
						onClick: () =>
							run({ label: t("Paused"), fn: () => actions.pause(pack.id) }),
					})}
				{status === "paused" &&
					item({
						label: t("Resume download"),
						onClick: () =>
							run({ label: t("Resumed"), fn: () => actions.resume(pack.id) }),
					})}
				{busy &&
					item({
						label: t("Cancel download"),
						onClick: () =>
							run({
								label: t("Download cancelled"),
								fn: () => actions.cancel(pack.id),
							}),
						danger: true,
					})}
				{installed &&
					(confirm
						? item({
								label: t("Click again to uninstall"),
								onClick: () =>
									run({
										label: t("{title} uninstalled", { title: pack.title }),
										fn: () => actions.uninstall(pack.id),
									}),
								danger: true,
							})
						: item({
								label: t("Uninstall…"),
								onClick: () => setConfirm(true),
								danger: true,
							}))}
				<div className="al-menu-sep" />
				{actions.setFavorite &&
					item({
						label: favorite
							? t("Remove from favorites")
							: t("Add to favorites"),
						onClick: () =>
							run({
								label: favorite
									? t("Removed from favorites")
									: t("Added to favorites"),
								fn: () =>
									actions.setFavorite?.({ packId: pack.id, on: !favorite }),
							}),
					})}
				{item({ label: t("Preview & details"), onClick: onDetails })}
			</div>
		</>
	);
}

function previewKind(url: string | null): "video" | "audio" | "image" | null {
	const path = url?.split(/[?#]/)[0].toLowerCase() ?? "";
	if (/\.(mp4|webm|mov|m4v)$/.test(path)) return "video";
	if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(path)) return "audio";
	if (/\.(gif|webp|apng|png|jpe?g|avif)$/.test(path)) return "image";
	return null;
}

/** Starts a pack's preview after the mouse rests on it briefly; sounds play out loud. */
function useHoverPreview(url: string | null) {
	const kind = previewKind(url);
	const [active, setActive] = useState(false);
	const timer = useRef<number | null>(null);
	const audio = useRef<HTMLAudioElement | null>(null);
	const stop = () => {
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = null;
		audio.current?.pause();
		audio.current = null;
		setActive(false);
	};
	useEffect(() => stop, []);
	return {
		kind,
		active,
		enter: () => {
			if (!url || !kind) return;
			timer.current = window.setTimeout(() => {
				setActive(true);
				if (kind === "audio") {
					audio.current = new Audio(url);
					audio.current.volume = 0.6;
					void audio.current.play().catch(() => {});
				}
			}, 250);
		},
		leave: stop,
	};
}

function PackCard({
	pack,
	state,
	selected,
	thumb,
	hoverPreview,
	onSelect,
	onMenu,
	favorite,
	onFavorite,
	drag,
	t,
}: {
	pack: CatalogPack;
	state: AssetStoreState;
	selected: boolean;
	thumb: string | null;
	/** Played while the mouse rests on the card: video, animated image or sound. */
	hoverPreview?: string | null;
	onMenu?: (event: React.MouseEvent) => void;
	onSelect: () => void;
	favorite: boolean;
	onFavorite?: (on: boolean) => void;
	drag: DragHandlers | null;
	t: T;
}) {
	const status = packStatus(pack, state);
	const download = state.downloads[pack.id];
	const hover = useHoverPreview(hoverPreview ?? null);
	return (
		<button
			type="button"
			className="al-card"
			aria-current={selected}
			onClick={onSelect}
			onContextMenu={onMenu}
			onMouseEnter={hover.enter}
			onMouseLeave={hover.leave}
			draggable={!!drag}
			onDragStart={drag ? (event) => drag.start({ pack, event }) : undefined}
			onDragEnd={drag?.end}
			title={
				drag
					? t("Drag onto the timeline to add it — it downloads first if needed")
					: undefined
			}
		>
			<div className="al-thumb">
				<PackThumb src={thumb} pack={pack} />
				{hover.active && hover.kind === "video" && hoverPreview && (
					<video
						className="al-hover"
						src={hoverPreview}
						autoPlay
						muted
						loop
						playsInline
					/>
				)}
				{hover.active && hover.kind === "image" && hoverPreview && (
					<img
						className="al-hover"
						src={hoverPreview}
						alt=""
						draggable={false}
					/>
				)}
				{hover.active && hover.kind === "audio" && (
					<span className="al-hover-sound" aria-hidden>
						♪
					</span>
				)}
				{onFavorite && (
					<FavoriteButton on={favorite} onChange={onFavorite} t={t} />
				)}
			</div>
			<div className="al-card-body">
				<span className="al-card-title">{pack.title}</span>
				<div className="al-meta">
					<span className={`al-badge ${BADGE_CLASS[status] ?? ""}`}>
						{t(STATUS_LABELS[status])}
					</span>
					<span className={`al-badge ${pack.plan}`}>
						{pack.plan === "pro" ? t("Pro") : t("Free")}
					</span>
					<span>{t(PACK_TYPE_LABELS[pack.type])}</span>
					{!pack.builtin && <span>· {formatBytes(pack.sizeBytes)}</span>}
				</div>
				{download &&
					(download.status === "downloading" ||
						download.status === "paused") && (
						<div className="al-progress" aria-label={t("Download progress")}>
							<i
								style={{
									width: `${Math.round((download.received / Math.max(1, download.total)) * 100)}%`,
								}}
							/>
						</div>
					)}
			</div>
		</button>
	);
}

function PackDetail({
	pack,
	state,
	actions,
	preview,
	desktop,
	favorite,
	drag,
	t,
}: {
	pack: CatalogPack;
	state: AssetStoreState;
	actions: AssetLibraryActions;
	preview: string | null;
	desktop: boolean;
	favorite: boolean;
	drag: DragHandlers | null;
	t: T;
}) {
	const status = packStatus(pack, state);
	const download = state.downloads[pack.id];
	const installed = state.installed[pack.id];
	const tags = [
		...(pack.tags.en ?? []),
		...(pack.tags.si ?? []),
		...(pack.tags.ta ?? []),
	];
	const pct = download
		? Math.round((download.received / Math.max(1, download.total)) * 100)
		: 0;
	return (
		<>
			<div className="al-thumb al-preview">
				<PackThumb src={preview} pack={pack} large />
			</div>
			<div className="al-row" style={{ justifyContent: "space-between" }}>
				<h3>{pack.title}</h3>
				{actions.setFavorite && (
					<FavoriteButton
						on={favorite}
						onChange={(on) => actions.setFavorite?.({ packId: pack.id, on })}
						t={t}
					/>
				)}
			</div>
			<div className="al-meta">
				<span className={`al-badge ${BADGE_CLASS[status] ?? ""}`}>
					{t(STATUS_LABELS[status])}
				</span>
				<span className={`al-badge ${pack.plan}`}>
					{pack.plan === "pro" ? t("Pro") : t("Free")}
				</span>
				{pack.languages.map((l) => (
					<span key={l} className="al-badge">
						{l.toUpperCase()}
					</span>
				))}
			</div>
			<p>{pack.description}</p>
			<div className="al-row">
				{actions.downloadAndAdd &&
					(status === "not-installed" ||
						status === "installed" ||
						status === "builtin" ||
						status === "update-available") && (
						<button
							type="button"
							className="al-btn primary"
							disabled={status === "not-installed" && !desktop}
							onClick={() => actions.downloadAndAdd?.(pack)}
							title={t(
								"Installs the pack, then adds it to your project (or applies it to the selected clips)",
							)}
						>
							{status === "not-installed" ? t("Download & Add") : t("Add")}
						</button>
					)}
				{status === "not-installed" && (
					<button
						type="button"
						className={actions.downloadAndAdd ? "al-btn" : "al-btn primary"}
						disabled={!desktop}
						onClick={() => actions.install(pack.id)}
					>
						{t("Download")} · {formatBytes(pack.sizeBytes)}
					</button>
				)}
				{status === "update-available" && (
					<button
						type="button"
						className="al-btn"
						onClick={() => actions.install(pack.id)}
					>
						{t("Update to {version}", { version: pack.version })}
					</button>
				)}
				{status === "downloading" && (
					<>
						<button
							type="button"
							className="al-btn"
							onClick={() => actions.pause(pack.id)}
						>
							{t("Pause")}
						</button>
						<button
							type="button"
							className="al-btn ghost"
							onClick={() => actions.cancel(pack.id)}
						>
							{t("Cancel")}
						</button>
					</>
				)}
				{(status === "paused" || status === "error") && (
					<>
						<button
							type="button"
							className="al-btn primary"
							onClick={() => actions.resume(pack.id)}
						>
							{status === "paused" ? t("Resume") : t("Retry")}
						</button>
						<button
							type="button"
							className="al-btn ghost"
							onClick={() => actions.cancel(pack.id)}
						>
							{t("Cancel")}
						</button>
					</>
				)}
				{(status === "installed" || status === "update-available") && (
					<button
						type="button"
						className="al-btn ghost"
						onClick={() => actions.uninstall(pack.id)}
					>
						{t("Uninstall")}
					</button>
				)}
				{status === "builtin" && (
					<span className="al-badge builtin">
						{t("Comes with FrameFlow · works offline")}
					</span>
				)}
			</div>
			{drag && (
				<p className="al-hint">
					{t(
						"Tip: drag the pack onto a track, clip or cut. It downloads first if needed, with a progress ring on the timeline.",
					)}
				</p>
			)}
			{download &&
				(download.status === "downloading" ||
					download.status === "paused" ||
					download.status === "installing") && (
					<div>
						<div className="al-progress">
							<i style={{ width: `${pct}%` }} />
						</div>
						<div className="al-meta" style={{ marginTop: 4 }}>
							{download.status === "installing"
								? t("Checking and unpacking…")
								: t("{received} of {total} ({pct}%)", {
										received: formatBytes(download.received),
										total: formatBytes(download.total),
										pct,
									})}
						</div>
					</div>
				)}
			{download?.error && (
				<div className="al-banner error" style={{ margin: 0 }} role="alert">
					{download.code === "device-limit" && (
						<strong>{t("Device limit reached")} </strong>
					)}
					{download.error}
				</div>
			)}
			<dl className="al-kv">
				<dt>{t("Version")}</dt>
				<dd>
					{pack.builtin && !installed
						? t("Built in")
						: (installed?.version ?? pack.version)}
				</dd>
				<dt>{t("Type")}</dt>
				<dd>{t(PACK_TYPE_LABELS[pack.type])}</dd>
				<dt>{t("Licence")}</dt>
				<dd>{pack.licence}</dd>
				{pack.dependencies && pack.dependencies.length > 0 && (
					<>
						<dt>{t("Needs")}</dt>
						<dd>{pack.dependencies.join(", ")}</dd>
					</>
				)}
				{pack.assetCount !== undefined && (
					<>
						<dt>{t("Assets")}</dt>
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
					<div className="me-group">{t("In this pack")}</div>
					<div className="al-assets">
						{pack.assetIds.map((id) => (
							<div
								key={id}
								className="al-asset"
								draggable={!!drag}
								onDragStart={
									drag
										? (event) => drag.start({ pack, event, assetId: id })
										: undefined
								}
								onDragEnd={drag?.end}
							>
								<span>{id}</span>
								<button
									type="button"
									className="al-btn ghost"
									title={
										status === "not-installed"
											? t(
													"Adds a placeholder now; the pack downloads and it fills in",
												)
											: t("Add at the playhead")
									}
									onClick={() => actions.addAsset?.(pack, id)}
								>
									+ {t("Add")}
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</>
	);
}

function SettingsPanel({
	state,
	actions,
	t,
}: {
	state: AssetStoreState;
	actions: AssetLibraryActions;
	t: T;
}) {
	const s = state.settings;
	const used = Object.values(state.installed).reduce(
		(n, p) => n + p.sizeBytes,
		0,
	);
	return (
		<div className="al-settings">
			<h3>{t("Download settings")}</h3>
			<label>
				{t("Packs a project needs")}
				<select
					value={s.missingPacks}
					onChange={(e) =>
						actions.configure({
							missingPacks: e.target
								.value as AssetLibrarySettings["missingPacks"],
						})
					}
				>
					<option value="auto">{t("Download automatically")}</option>
					<option value="ask">{t("Ask first")}</option>
					<option value="never">{t("Never (keep placeholders)")}</option>
				</select>
			</label>
			<label>
				{t("Update installed packs automatically")}
				<input
					type="checkbox"
					checked={s.autoUpdate}
					onChange={(e) => actions.configure({ autoUpdate: e.target.checked })}
				/>
			</label>
			<label>
				{t("Starter packs on first launch")}
				<input
					type="checkbox"
					checked={s.starterPacks}
					onChange={(e) =>
						actions.configure({ starterPacks: e.target.checked })
					}
				/>
			</label>
			<label>
				{t("Only on Wi-Fi / unmetered")}
				<input
					type="checkbox"
					checked={s.unmeteredOnly}
					onChange={(e) =>
						actions.configure({ unmeteredOnly: e.target.checked })
					}
				/>
			</label>
			<label>
				{t("Channel")}
				<select
					value={s.channel}
					onChange={(e) =>
						actions.configure({ channel: e.target.value as "stable" | "beta" })
					}
				>
					<option value="stable">{t("Stable")}</option>
					<option value="beta">{t("Beta")}</option>
				</select>
			</label>
			<label>
				{t("Storage limit (GB, 0 = none)")}
				<input
					type="number"
					min={0}
					step={0.5}
					value={s.storageLimitBytes / 1024 ** 3}
					onChange={(e) =>
						actions.configure({
							storageLimitBytes:
								Math.max(0, Number(e.target.value)) * 1024 ** 3,
						})
					}
					style={{ width: 80 }}
				/>
			</label>
			<p style={{ marginTop: 10 }}>
				{t("Installed packs use {size}.", { size: formatBytes(used) })}
			</p>
			{state.library && (
				<p>
					{state.library.signedIn
						? state.library.device.status === "registered"
							? t("This device is registered with your Asset Library account.")
							: state.library.device.status === "limit"
								? t("Device limit reached")
								: t("Registering this device…")
						: t("Sign in to sync favorites and see your download history.")}
				</p>
			)}
			<div className="al-row" style={{ marginTop: 8 }}>
				<button type="button" className="al-btn" onClick={actions.clearUnused}>
					{t("Clear unused")}
				</button>
			</div>
		</div>
	);
}

/** Download history of the signed-in account (all devices). */
function HistoryPanel({
	load,
	packs,
	t,
}: {
	load: NonNullable<AssetLibraryActions["loadHistory"]>;
	packs: CatalogPack[];
	t: T;
}) {
	const [rows, setRows] = useState<LibraryDownloadRow[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [state, setState] = useState<
		"loading" | "ready" | "signed-out" | "error"
	>("loading");
	const [error, setError] = useState<string | null>(null);
	const more = (from: string | null) =>
		load(from).then(
			(page) => {
				if (!page.signedIn) {
					setState("signed-out");
					return;
				}
				setRows((r) => (from ? [...r, ...page.data] : page.data));
				setCursor(page.next_cursor);
				setState("ready");
			},
			(e: unknown) => {
				setError(e instanceof Error ? e.message : String(e));
				setState("error");
			},
		);
	useEffect(() => {
		void more(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- load once when opened
	}, []);
	const titleOf = (row: LibraryDownloadRow) =>
		row.title ??
		packs.find((p) => p.id === row.packId)?.title ??
		row.packId ??
		t("Removed asset");
	return (
		<div className="al-history">
			<h3>{t("Download history")}</h3>
			{state === "loading" && <p>{t("Loading…")}</p>}
			{state === "signed-out" && (
				<p>{t("Sign in to see what you've downloaded on all your devices.")}</p>
			)}
			{state === "error" && (
				<div className="al-banner error" style={{ margin: 0 }}>
					{t("Couldn't load your history ({error}).", { error: error ?? "" })}
				</div>
			)}
			{state === "ready" && rows.length === 0 && (
				<p>{t("Nothing downloaded yet.")}</p>
			)}
			{rows.map((row) => (
				<div key={row.id} className="al-asset">
					<span>
						{titleOf(row)} <span className="al-meta">{row.version ?? ""}</span>
					</span>
					<span className="al-meta">
						{row.status === "installed"
							? t("Installed")
							: row.status === "failed"
								? t("Failed")
								: (row.status ?? "")}
						{" · "}
						{row.startedAt ? new Date(row.startedAt).toLocaleDateString() : ""}
						{row.thisDevice ? ` · ${t("this device")}` : ""}
					</span>
				</div>
			))}
			{cursor && (
				<button
					type="button"
					className="al-btn"
					onClick={() => void more(cursor)}
				>
					{t("Show more")}
				</button>
			)}
		</div>
	);
}

const GENERIC_TAGS = new Set([
	"worksuite",
	"free",
	"pack",
	"sound",
	"sounds",
	"sfx",
	"lut",
	"luts",
	"font",
	"fonts",
	"template",
	"templates",
	"text",
	"video",
	"graphics",
	"sticker",
	"stickers",
	"effect",
	"effects",
	"filter",
	"filters",
	"transition",
	"transitions",
	"motion",
	"lottie",
	"en",
	"si",
	"ta",
]);
const titleCase = (s: string) =>
	s.replace(
		/(^|[\s-])(\p{L})/gu,
		(_m, a: string, b: string) => a + b.toUpperCase(),
	);

/**
 * Sub-categories for the sidebar: the pack's own tags when they group the
 * packs, otherwise the title without its number ("Bold Cinematic 3" → "Bold Cinematic").
 */
function packCategories(packs: CatalogPack[]) {
	const stem = (p: CatalogPack) =>
		p.title.replace(/[\s_-]*\d+$/, "").trim() || p.title;
	const tagsOf = (p: CatalogPack) =>
		(p.tags.en ?? [])
			.map((tag) => tag.toLowerCase().trim())
			.filter((tag) => tag && !GENERIC_TAGS.has(tag));
	const tagCount = new Map<string, number>();
	for (const p of packs)
		for (const tag of new Set(tagsOf(p)))
			tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
	// Useful tags group at least 2 packs but not nearly all of them.
	const useful = [...tagCount].filter(
		([, n]) => n >= 2 && n < packs.length * 0.8,
	);
	const covered = packs.filter((p) =>
		tagsOf(p).some((tag) => useful.some(([u]) => u === tag)),
	).length;
	// Title stems only help when they form real groups ("Bold Cinematic 1…5");
	// one-off names (fonts) would list every pack, so tags win there.
	const stems = new Map<string, number>();
	for (const p of packs) stems.set(stem(p), (stems.get(stem(p)) ?? 0) + 1);
	const stemsUseful = stems.size > 1 && stems.size <= Math.max(8, packs.length / 3);
	const byTags = useful.length >= 2 && (covered >= packs.length * 0.6 || !stemsUseful);
	if (!byTags && !stemsUseful) return { list: [] as [string, number][], of: () => [] as string[], total: packs.length };
	const of = (p: CatalogPack): string[] =>
		byTags
			? tagsOf(p)
					.filter((tag) => (tagCount.get(tag) ?? 0) >= 2)
					.map(titleCase)
			: [stem(p)];
	const counts = new Map<string, number>();
	for (const p of packs)
		for (const c of new Set(of(p))) counts.set(c, (counts.get(c) ?? 0) + 1);
	const list = [...counts]
		.filter(([, n]) => n >= 2 || counts.size <= 40)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 60);
	if (!byTags) list.sort((a, b) => a[0].localeCompare(b[0]));
	return { list, of, total: packs.length };
}
