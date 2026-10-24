// Asset download center client (SRS AL-07..AL-12). Packs are listed in a
// signed catalog:
//   <WSC_ASSET_URL>/<channel>/catalog.json      the pack list
//   <WSC_ASSET_URL>/<channel>/catalog.json.sig  base64 Ed25519 signature
// The catalog is only trusted when its signature verifies against the key
// embedded below; each pack zip is only installed when its sha256 matches
// the catalog. Packs unpack into <userData>/assets/<packId>/<version>/ and
// the page reads them through the wsc-asset:// protocol, which serves only
// files inside installed pack folders.
const fs = require("node:fs");
const path = require("node:path");
const io = require("./asset-pack-io");

const ASSET_BASE = process.env.WSC_ASSET_URL || "https://download.worksuitecloud.com/assets";
const CHANNELS = ["stable", "beta"];
/** Public half of the catalog signing key (private half: CI secret ASSET_SIGNING_KEY). */
const CATALOG_PUBLIC_KEY =
	process.env.WSC_ASSET_PUBLIC_KEY ||
	"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAf42Kl/5GTU8PTayweURzXqp6S4BBhkbQv360G+ohOB8=\n-----END PUBLIC KEY-----\n";
const SCHEME = "wsc-asset";

const DEFAULT_SETTINGS = {
	channel: "stable",
	/** What to do when an opened project needs packs that aren't installed. */
	missingPacks: "auto", // auto | ask | never
	autoUpdate: true,
	starterPacks: true,
	unmeteredOnly: false,
	/** 0 = no limit. */
	storageLimitBytes: 0,
};

/**
 * The store itself, without Electron, so tests can drive it with a fake
 * fetch and a temp folder.
 */
function createAssetStore({
	root,
	fetchImpl = (...args) => fetch(...args),
	publicKey = CATALOG_PUBLIC_KEY,
	assetBase = ASSET_BASE,
	appVersion = "0.0.0",
	builtinPacks = [],
	isOffline = () => false,
	onChange = () => {},
	/** Bearer token for Pro packs (Worksuite Cloud sign-in); null when signed out. */
	getAccessToken = async () => null,
}) {
	fs.mkdirSync(root, { recursive: true });
	const file = (...parts) => path.join(root, ...parts);
	const readJson = (p, fallback) => {
		try {
			return JSON.parse(fs.readFileSync(p, "utf8"));
		} catch {
			return fallback;
		}
	};
	const writeJson = (p, value) => {
		fs.mkdirSync(path.dirname(p), { recursive: true });
		const tmp = `${p}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(value, null, "\t"));
		fs.renameSync(tmp, p);
	};

	let settings = { ...DEFAULT_SETTINGS, ...readJson(file("settings.json"), {}) };
	if (!CHANNELS.includes(settings.channel)) settings.channel = "stable";
	let installed = readJson(file("installed.json"), { packs: {} });
	if (!installed || typeof installed.packs !== "object") installed = { packs: {} };
	let catalog = null;
	let catalogStatus = { state: "idle", error: null, fetchedAt: null, stale: false };
	/** packId → { status, received, total, version, error, controller } */
	const downloads = new Map();

	function snapshot() {
		return {
			settings: { ...settings },
			catalog,
			catalogStatus: { ...catalogStatus },
			installed: Object.fromEntries(Object.entries(installed.packs).map(([id, entry]) => [id, { ...entry }])),
			builtin: builtinPacks,
			downloads: Object.fromEntries(
				[...downloads].map(([id, d]) => [id, { status: d.status, received: d.received, total: d.total, version: d.version, error: d.error ?? null }]),
			),
		};
	}
	const emit = () => onChange(snapshot());

	// ---------- catalog ----------

	const catalogUrl = () => `${assetBase.replace(/\/$/, "")}/${settings.channel}/catalog.json`;
	const cacheDir = () => file("cache", settings.channel);

	function acceptCatalog(text, sig) {
		if (!io.verifyCatalog(text, sig, publicKey)) throw Object.assign(new Error("The asset catalog's signature isn't valid"), { code: "bad-signature" });
		const parsed = JSON.parse(text);
		const problems = io.catalogProblems(parsed);
		if (problems.length) throw Object.assign(new Error(`The asset catalog is malformed: ${problems[0]}`), { code: "bad-catalog" });
		return parsed;
	}

	function loadCachedCatalog() {
		try {
			const text = fs.readFileSync(path.join(cacheDir(), "catalog.json"), "utf8");
			const sig = fs.readFileSync(path.join(cacheDir(), "catalog.json.sig"), "utf8");
			return acceptCatalog(text, sig);
		} catch {
			return null;
		}
	}

	/** Fetches (ETag-aware) and verifies the catalog; falls back to the cached copy. */
	async function refreshCatalog() {
		catalogStatus = { ...catalogStatus, state: "checking", error: null };
		emit();
		try {
			if (isOffline()) throw Object.assign(new Error("Offline mode is on"), { code: "offline" });
			const meta = readJson(path.join(cacheDir(), "meta.json"), {});
			const cached = meta.etag ? loadCachedCatalog() : null;
			const res = await fetchImpl(catalogUrl(), {
				cache: "no-store",
				headers: cached && meta.etag ? { "If-None-Match": meta.etag } : {},
			});
			if (res.status === 304 && cached) {
				catalog = cached;
			} else {
				if (!res.ok) throw new Error(`The download center answered ${res.status}`);
				const text = await res.text();
				const sigRes = await fetchImpl(`${catalogUrl()}.sig`, { cache: "no-store" });
				if (!sigRes.ok) throw Object.assign(new Error("The asset catalog isn't signed"), { code: "bad-signature" });
				const sig = await sigRes.text();
				catalog = acceptCatalog(text, sig);
				fs.mkdirSync(cacheDir(), { recursive: true });
				fs.writeFileSync(path.join(cacheDir(), "catalog.json"), text);
				fs.writeFileSync(path.join(cacheDir(), "catalog.json.sig"), sig);
				writeJson(path.join(cacheDir(), "meta.json"), { etag: res.headers.get("etag") ?? null });
			}
			catalogStatus = { state: "ready", error: null, fetchedAt: Date.now(), stale: false };
		} catch (error) {
			const cached = loadCachedCatalog();
			if (cached) catalog = cached;
			catalogStatus = {
				state: cached ? "ready" : "error",
				error: String(error?.message ?? error),
				code: error?.code ?? "network",
				fetchedAt: catalogStatus.fetchedAt,
				stale: !!cached,
			};
		}
		emit();
		return snapshot();
	}

	const findPack = (packId) => catalog?.packs.find((p) => p.id === packId) ?? null;

	// ---------- install ----------

	function assertPackId(packId) {
		if (typeof packId !== "string" || !io.PACK_ID.test(packId)) throw new Error("Invalid pack id");
	}

	function packUrl(pack) {
		// `files` may be absolute (CDN) or relative to the catalog.
		return new URL(pack.files, catalogUrl()).toString();
	}

	function usedBytes() {
		return Object.values(installed.packs).reduce((n, p) => n + (p.sizeBytes || 0), 0);
	}

	async function download(pack, d) {
		const part = file("downloads", `${pack.id}-${pack.version}.zip.part`);
		fs.mkdirSync(path.dirname(part), { recursive: true });
		let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
		if (have > pack.sizeBytes) {
			fs.rmSync(part, { force: true });
			have = 0;
		}
		if (have < pack.sizeBytes) {
			const token = pack.plan === "free" ? null : await getAccessToken().catch(() => null);
			const res = await fetchImpl(packUrl(pack), {
				headers: { ...(have ? { Range: `bytes=${have}-` } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
				signal: d.controller.signal,
			});
			if (res.status === 200 && have) {
				// The server ignored the range: start over.
				fs.rmSync(part, { force: true });
				have = 0;
			} else if (res.status === 401) throw Object.assign(new Error("Sign in to Worksuite Cloud to download Pro packs"), { code: "sign-in" });
			else if (res.status === 403) throw Object.assign(new Error("This pack needs a Pro plan"), { code: "plan" });
			else if (!res.ok) throw new Error(`Download failed (${res.status})`);
			d.received = have;
			d.total = pack.sizeBytes;
			const out = fs.createWriteStream(part, { flags: have ? "a" : "w" });
			try {
				const reader = res.body.getReader();
				let lastEmit = 0;
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					d.received += value.length;
					if (d.received > pack.sizeBytes) throw new Error("The download is larger than the catalog says");
					if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r));
					if (Date.now() - lastEmit > 150) {
						lastEmit = Date.now();
						emit();
					}
				}
			} finally {
				await new Promise((r) => out.end(r));
			}
		}
		const size = fs.statSync(part).size;
		const digest = await io.sha256File(part);
		if (size !== pack.sizeBytes || digest !== pack.sha256) {
			fs.rmSync(part, { force: true });
			throw Object.assign(new Error("The downloaded pack doesn't match the catalog (sha256); it was discarded"), { code: "bad-hash" });
		}
		return part;
	}

	/** Unpacks a verified zip into <root>/<id>/<version>/ and records it. */
	function installZip(pack, zipPath) {
		const finalDir = file(pack.id, pack.version);
		const tmpDir = file(pack.id, `.${pack.version}.${process.pid}.${Date.now()}`);
		try {
			io.extractZip(fs.readFileSync(zipPath), tmpDir);
			const manifest = readJson(path.join(tmpDir, "pack.json"), null);
			if (!manifest || manifest.id !== pack.id || manifest.version !== pack.version) throw new Error("The pack's pack.json doesn't match the catalog");
			fs.rmSync(finalDir, { recursive: true, force: true });
			fs.renameSync(tmpDir, finalDir);
		} catch (error) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
			throw error;
		}
		fs.rmSync(zipPath, { force: true });
		const previous = installed.packs[pack.id];
		installed.packs[pack.id] = {
			id: pack.id,
			type: pack.type,
			title: pack.title,
			version: pack.version,
			sizeBytes: dirSize(finalDir),
			installedAt: Date.now(),
			previousVersion: previous && previous.version !== pack.version ? previous.version : (previous?.previousVersion ?? null),
		};
		writeJson(file("installed.json"), installed);
	}

	async function install(packId) {
		assertPackId(packId);
		const pack = findPack(packId);
		if (!pack) throw new Error(`Pack "${packId}" isn't in the catalog`);
		if (io.compareSemver(appVersion, pack.minAppVersion) < 0) throw new Error(`This pack needs FrameFlow ${pack.minAppVersion} or later`);
		if (isOffline()) throw new Error("Offline mode is on");
		if (settings.storageLimitBytes && usedBytes() + pack.sizeBytes * 2 > settings.storageLimitBytes) throw new Error("Installing this pack would go over your asset storage limit");
		const existing = downloads.get(packId);
		if (existing?.status === "downloading") return existing.promise;
		const d = { status: "downloading", received: 0, total: pack.sizeBytes, version: pack.version, error: null, controller: new AbortController() };
		downloads.set(packId, d);
		emit();
		d.promise = (async () => {
			try {
				const zip = await download(pack, d);
				d.status = "installing";
				emit();
				installZip(pack, zip);
				downloads.delete(packId);
				emit();
				return snapshot();
			} catch (error) {
				if (d.controller.signal.aborted) {
					// Paused keeps the partial file for a ranged resume; cancelled removes it.
					if (d.status !== "paused") downloads.delete(packId);
				} else {
					d.status = "error";
					d.error = String(error?.message ?? error);
				}
				emit();
				if (!d.controller.signal.aborted) throw error;
				return snapshot();
			}
		})();
		return d.promise;
	}

	function pause(packId) {
		assertPackId(packId);
		const d = downloads.get(packId);
		if (d?.status !== "downloading") return snapshot();
		d.status = "paused";
		d.controller.abort();
		emit();
		return snapshot();
	}

	function resume(packId) {
		assertPackId(packId);
		downloads.delete(packId);
		return install(packId);
	}

	function cancel(packId) {
		assertPackId(packId);
		const d = downloads.get(packId);
		if (d) {
			d.status = "cancelled";
			d.controller.abort();
			downloads.delete(packId);
		}
		for (const name of safeList(file("downloads"))) if (name.startsWith(`${packId}-`)) fs.rmSync(file("downloads", name), { force: true });
		emit();
		return snapshot();
	}

	function uninstall(packId) {
		assertPackId(packId);
		if (!installed.packs[packId]) return snapshot();
		fs.rmSync(file(packId), { recursive: true, force: true });
		delete installed.packs[packId];
		writeJson(file("installed.json"), installed);
		emit();
		return snapshot();
	}

	/** Removes old versions, half-finished downloads and leftovers of uninstalled packs. */
	function clearUnused() {
		let freed = 0;
		for (const name of safeList(root)) {
			if (!io.PACK_ID.test(name)) continue;
			const entry = installed.packs[name];
			for (const version of safeList(file(name))) {
				if (entry && version === entry.version) continue;
				freed += dirSize(file(name, version));
				fs.rmSync(file(name, version), { recursive: true, force: true });
			}
			if (!entry) fs.rmSync(file(name), { recursive: true, force: true });
			else entry.previousVersion = null;
		}
		for (const name of safeList(file("downloads"))) {
			const [id] = name.split(/-\d+\./);
			if (downloads.get(id)?.status === "downloading") continue;
			freed += fs.statSync(file("downloads", name)).size;
			fs.rmSync(file("downloads", name), { force: true });
		}
		writeJson(file("installed.json"), installed);
		emit();
		return { freedBytes: freed, ...snapshot() };
	}

	function diskUsage() {
		return { packs: usedBytes(), total: dirSize(root) };
	}

	function configure(patch = {}) {
		const next = { ...settings };
		if (CHANNELS.includes(patch.channel)) next.channel = patch.channel;
		if (["auto", "ask", "never"].includes(patch.missingPacks)) next.missingPacks = patch.missingPacks;
		for (const key of ["autoUpdate", "starterPacks", "unmeteredOnly"]) if (typeof patch[key] === "boolean") next[key] = patch[key];
		if (Number.isFinite(patch.storageLimitBytes) && patch.storageLimitBytes >= 0) next.storageLimitBytes = Math.floor(patch.storageLimitBytes);
		const channelChanged = next.channel !== settings.channel;
		settings = next;
		writeJson(file("settings.json"), settings);
		if (channelChanged) catalog = loadCachedCatalog();
		emit();
		return snapshot();
	}

	/** Installed packs with a newer catalog version. */
	function updatesAvailable() {
		return Object.values(installed.packs).filter((entry) => {
			const pack = findPack(entry.id);
			return pack && io.compareSemver(pack.version, entry.version) > 0;
		});
	}

	async function updateAll() {
		const results = [];
		for (const entry of updatesAvailable()) {
			try {
				await install(entry.id);
				results.push({ id: entry.id, ok: true });
			} catch (error) {
				results.push({ id: entry.id, ok: false, error: String(error?.message ?? error) });
			}
		}
		return results;
	}

	/**
	 * The file a wsc-asset:// URL names, or null. Only `<packId>/<version>/<path>`
	 * of an installed version resolves, and never outside its folder.
	 */
	function resolveAssetUrl(url) {
		let parsed;
		try {
			parsed = new URL(url);
		} catch {
			return null;
		}
		if (parsed.protocol !== `${SCHEME}:`) return null;
		const packId = parsed.hostname;
		const [version, ...rest] = decodeURIComponent(parsed.pathname).replace(/^\//, "").split("/");
		if (!io.PACK_ID.test(packId) || !io.SEMVER.test(version ?? "")) return null;
		const entry = installed.packs[packId];
		if (!entry || (entry.version !== version && entry.previousVersion !== version)) return null;
		const rel = rest.join("/");
		if (!io.safeEntryName(rel)) return null;
		const target = io.resolveInside(file(packId, version), rel);
		if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
		return target;
	}

	return {
		getState: snapshot,
		refreshCatalog,
		install,
		pause,
		resume,
		cancel,
		uninstall,
		clearUnused,
		diskUsage,
		configure,
		updatesAvailable,
		updateAll,
		resolveAssetUrl,
		/** Test hook: install a zip already on disk (still verified against the catalog). */
		_installZip: installZip,
	};
}

function safeList(dir) {
	try {
		return fs.readdirSync(dir).filter((n) => !n.startsWith("."));
	} catch {
		return [];
	}
}

function dirSize(dir) {
	let total = 0;
	let names = [];
	try {
		names = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of names) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) total += dirSize(p);
		else if (entry.isFile()) total += fs.statSync(p).size;
	}
	return total;
}

const CONTENT_TYPES = {
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".cube": "text/plain",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".gif": "image/gif",
	".flac": "audio/flac",
	".aac": "audio/aac",
	".mov": "video/quicktime",
	".txt": "text/plain",
};

// ---------- Electron glue ----------

/** Packs that ship inside the app (apps/web/public/worksuite-pack), shown as installed. */
const BUILTIN_PACKS = [
	{ id: "worksuite-essentials", type: "motion", title: "Worksuite Essentials", version: "builtin" },
	{ id: "subscribe-buttons", type: "motion", title: "Subscribe buttons", version: "builtin" },
	{ id: "worksuite-sfx", type: "sounds", title: "Worksuite sound effects", version: "builtin" },
];

let store = null;

/** Must run before app is ready: lets the page fetch wsc-asset:// with CORS. */
function registerScheme() {
	const { protocol } = require("electron");
	protocol.registerSchemesAsPrivileged([
		{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
	]);
}

/** Catalog checks while the app runs (Asset Library blueprint §8.2). */
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

function init({ isOffline, onNetworkChange, getAccessToken } = {}) {
	const { app, BrowserWindow } = require("electron");
	store = createAssetStore({
		root: path.join(app.getPath("userData"), "assets"),
		appVersion: app.getVersion(),
		builtinPacks: BUILTIN_PACKS,
		isOffline,
		getAccessToken,
		onChange: (state) => {
			for (const win of BrowserWindow.getAllWindows()) win.webContents.send("assets:changed", state);
		},
	});
	const sync = async () => {
		if (isOffline?.()) return;
		await store.refreshCatalog();
		if (store.getState().settings.autoUpdate) await store.updateAll();
	};
	// Catalog check and installed-pack updates shortly after start, then
	// every 15 minutes and whenever the app comes back online, so newly
	// published library assets appear without a restart.
	setTimeout(sync, 8000).unref?.();
	setInterval(sync, SYNC_INTERVAL_MS).unref?.();
	let wasOffline = !!isOffline?.();
	onNetworkChange?.((state) => {
		if (wasOffline && !state.offline) sync();
		wasOffline = !!state.offline;
	});
	return store;
}

/** Serves installed pack files to `session` (only to the app's own origin). */
function handleProtocol({ session, origin }) {
	session.protocol.handle(SCHEME, async (request) => {
		const target = store?.resolveAssetUrl(request.url);
		const headers = { "Access-Control-Allow-Origin": origin, "Cache-Control": "no-cache" };
		if (!target) return new Response("Not found", { status: 404, headers });
		const type = CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
		return new Response(await fs.promises.readFile(target), { status: 200, headers: { ...headers, "Content-Type": type } });
	});
}

/** IPC: only pack ids and settings cross; never paths. */
function registerIpc(handle) {
	const s = () => {
		if (!store) throw new Error("Asset store isn't ready");
		return store;
	};
	handle("assets:get-state", () => s().getState());
	handle("assets:refresh", () => s().refreshCatalog());
	handle("assets:install", (packId) => s().install(packId));
	handle("assets:pause", (packId) => s().pause(packId));
	handle("assets:resume", (packId) => s().resume(packId));
	handle("assets:cancel", (packId) => s().cancel(packId));
	handle("assets:uninstall", (packId) => s().uninstall(packId));
	handle("assets:clear-unused", () => s().clearUnused());
	handle("assets:disk-usage", () => s().diskUsage());
	handle("assets:configure", (patch) => s().configure(patch && typeof patch === "object" ? patch : {}));
	handle("assets:update-all", () => s().updateAll());
}

module.exports = {
	ASSET_BASE,
	CATALOG_PUBLIC_KEY,
	SCHEME,
	BUILTIN_PACKS,
	createAssetStore,
	registerScheme,
	init,
	handleProtocol,
	registerIpc,
};
