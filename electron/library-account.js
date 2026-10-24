// FrameFlow Asset Library account features (blueprint §7.1, §7.2, §8.2, §8.6)
// on top of the app's Worksuite Cloud sign-in: device registration, download
// grants with X-Device-Id, favorites (offline + server, unioned on the first
// sign-in), download history, the server mirror of installed packs, and the
// live sync stream (SSE) that refreshes the catalog as soon as assets change.
// Runs in the main process only; access tokens never leave it.
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LIBRARY_API = process.env.WSC_LIBRARY_API || "https://library.frameflow.worksuitecloud.com";
/** Sync ops that change what the catalog lists. */
const CATALOG_OPS = new Set(["upsert", "unpublish", "deprecate", "delete"]);

class LibraryApiError extends Error {
	constructor(status, body) {
		super(body?.error?.message ?? `The Asset Library answered ${status}`);
		this.status = status;
		this.code = body?.error?.code ?? "HTTP_ERROR";
		this.details = Array.isArray(body?.error?.details) ? body.error.details : [];
	}
}

const osName = (platform) => (platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux");

/**
 * @param {object} o
 * @param {string} o.root  folder for library-*.json (userData)
 * @param {() => Promise<string|null>} o.getAccessToken
 * @param {() => Array<{ id: string, libraryAssetId?: string }>} o.getCatalogPacks
 * @param {() => void} o.onCatalogChange  called when the live stream reports a catalog change
 */
function createLibraryAccount({
	root,
	apiBase = LIBRARY_API,
	fetchImpl = (...args) => fetch(...args),
	getAccessToken = async () => null,
	appVersion = "0.0.0",
	platform = process.platform,
	deviceName = os.hostname(),
	isOffline = () => false,
	getCatalogPacks = () => [],
	onCatalogChange = () => {},
	onChange = () => {},
	backoff = { baseMs: 1000, maxMs: 60_000 },
}) {
	fs.mkdirSync(root, { recursive: true });
	const file = (name) => path.join(root, name);
	const readJson = (p, fallback) => {
		try {
			return JSON.parse(fs.readFileSync(p, "utf8"));
		} catch {
			return fallback;
		}
	};
	const writeJson = (p, value) => {
		const tmp = `${p}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(value, null, "\t"));
		fs.renameSync(tmp, p);
	};
	const base = `${apiBase.replace(/\/$/, "")}/api/v1`;

	// A random id made once per install; the server only ever sees its hash.
	let device = readJson(file("library-device.json"), {});
	if (typeof device.installId !== "string" || device.installId.length < 16) {
		device = { installId: crypto.randomBytes(32).toString("hex"), deviceId: null };
		writeJson(file("library-device.json"), device);
	}
	const fingerprintHash = crypto.createHash("sha256").update(device.installId).digest("hex");

	/** packIds; `mergedFor` lists accounts whose offline favorites were already unioned. */
	let favorites = readJson(file("library-favorites.json"), { packIds: [], mergedFor: [] });
	if (!Array.isArray(favorites.packIds)) favorites = { packIds: [], mergedFor: [] };
	if (!Array.isArray(favorites.mergedFor)) favorites.mergedFor = [];
	let sync = readJson(file("library-sync.json"), { seq: 0 });

	let signedIn = false;
	let accountId = null;
	let deviceStatus = device.deviceId ? "registered" : "unregistered"; // unregistered | registering | registered | limit | error
	let deviceError = null;
	let live = "off"; // off | connecting | connected | reconnecting
	const emit = () => onChange(getState());

	function getState() {
		return {
			signedIn,
			device: { status: deviceStatus, id: device.deviceId ?? null, error: deviceError },
			favorites: [...favorites.packIds],
			live,
		};
	}

	async function call(method, route, body) {
		const token = await getAccessToken().catch(() => null);
		const res = await fetchImpl(`${base}${route}`, {
			method,
			headers: {
				Accept: "application/json",
				"X-App-Version": appVersion,
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(device.deviceId ? { "X-Device-Id": device.deviceId } : {}),
				...(body ? { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (res.status === 204) return null;
		const data = await res.json().catch(() => null);
		if (!res.ok) throw new LibraryApiError(res.status, data);
		return data;
	}

	const packIdFor = (assetId) => getCatalogPacks().find((p) => p.libraryAssetId === assetId)?.id ?? null;
	const assetIdFor = (packId) => getCatalogPacks().find((p) => p.id === packId)?.libraryAssetId ?? null;

	// ---------- devices ----------

	/** A clear message for DEVICE_LIMIT / DEVICE_REQUIRED, or null. */
	function deviceProblem(error) {
		if (error?.code === "DEVICE_LIMIT") {
			const limit = error.details?.find((d) => d.rule === "device.limit")?.value;
			return {
				code: "DEVICE_LIMIT",
				limit: Number.isFinite(limit) ? limit : null,
				message: `Your plan allows ${Number.isFinite(limit) ? limit : "a limited number of"} devices and they're all in use. Remove a device in Manage account, then try again.`,
			};
		}
		if (error?.code === "DEVICE_REQUIRED") return { code: "DEVICE_REQUIRED", limit: null, message: "This device isn't registered with the Asset Library. Sign in again to register it." };
		return null;
	}

	async function registerDevice() {
		if (!signedIn || isOffline()) return getState();
		deviceStatus = "registering";
		deviceError = null;
		emit();
		try {
			const result = await call("POST", "/devices/register", { fingerprint_hash: fingerprintHash, os: osName(platform), app_version: appVersion, name: deviceName });
			device = { ...device, deviceId: result?.id ?? null };
			writeJson(file("library-device.json"), device);
			deviceStatus = device.deviceId ? "registered" : "error";
		} catch (error) {
			const problem = deviceProblem(error);
			deviceStatus = problem?.code === "DEVICE_LIMIT" ? "limit" : "error";
			deviceError = problem ?? { code: error?.code ?? "network", limit: null, message: String(error?.message ?? error) };
		}
		emit();
		return getState();
	}

	// ---------- download grants ----------

	const downloadHeaders = () => (device.deviceId ? { "X-Device-Id": device.deviceId } : {});

	/**
	 * Signed download URL for a Pro pack, or null to use the feed URL with the
	 * bearer token (signed out, not a library asset, or an older server).
	 * DEVICE_LIMIT / DEVICE_REQUIRED are thrown with a clear message.
	 */
	async function requestGrant(pack) {
		if (!signedIn || !pack.libraryAssetId) return null;
		try {
			const grant = await call("POST", `/assets/${encodeURIComponent(pack.libraryAssetId)}/download`, { version: pack.version, device_id: device.deviceId });
			return grant?.url ? { ...grant, url: new URL(grant.url, `${apiBase.replace(/\/$/, "")}/`).toString() } : null;
		} catch (error) {
			const problem = deviceProblem(error);
			if (problem) {
				if (problem.code === "DEVICE_LIMIT") deviceStatus = "limit";
				deviceError = problem;
				emit();
				throw Object.assign(new Error(problem.message), { code: problem.code === "DEVICE_LIMIT" ? "device-limit" : "device-required" });
			}
			if (error instanceof LibraryApiError && (error.status === 401 || error.status === 403)) throw error;
			return null;
		}
	}

	async function completeDownload(grant, report) {
		if (!grant?.download_id) return;
		await call("POST", `/downloads/${encodeURIComponent(grant.download_id)}/complete`, report).catch(() => {});
	}

	// ---------- favorites ----------

	function saveFavorites() {
		writeJson(file("library-favorites.json"), favorites);
	}

	async function setFavorite(packId, on) {
		const has = favorites.packIds.includes(packId);
		if (on && !has) favorites.packIds.unshift(packId);
		if (!on && has) favorites.packIds = favorites.packIds.filter((id) => id !== packId);
		saveFavorites();
		emit();
		const assetId = assetIdFor(packId);
		if (signedIn && assetId && !isOffline()) await call(on ? "PUT" : "DELETE", `/me/favorites/${encodeURIComponent(assetId)}`).catch(() => {});
		return getState();
	}

	/**
	 * First sign-in of an account on this install: PUT every offline favorite
	 * (union). Then the server list is the truth, plus favorites of packs the
	 * server doesn't know (not library assets).
	 */
	async function syncFavorites() {
		if (!signedIn || isOffline()) return getState();
		const key = accountId ?? "default";
		const firstMerge = !favorites.mergedFor.includes(key);
		if (firstMerge) {
			for (const packId of favorites.packIds) {
				const assetId = assetIdFor(packId);
				if (assetId) await call("PUT", `/me/favorites/${encodeURIComponent(assetId)}`).catch(() => {});
			}
		}
		try {
			const list = await call("GET", "/me/favorites");
			const server = (list?.data ?? []).map((a) => packIdFor(a?.id)).filter(Boolean);
			const localOnly = favorites.packIds.filter((id) => !assetIdFor(id));
			const keepLocal = firstMerge ? favorites.packIds : localOnly;
			favorites.packIds = [...new Set([...server, ...keepLocal])];
			if (firstMerge) favorites.mergedFor.push(key);
			saveFavorites();
			emit();
		} catch {
			// Offline or older server: keep the local list.
		}
		return getState();
	}

	// ---------- history ----------

	async function history({ cursor = null, limit = 50 } = {}) {
		if (!signedIn) return { data: [], next_cursor: null, signedIn: false };
		const qs = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) });
		if (cursor) qs.set("cursor", String(cursor));
		const page = await call("GET", `/me/downloads?${qs}`);
		return {
			signedIn: true,
			next_cursor: page?.next_cursor ?? null,
			data: (page?.data ?? []).map((row) => ({
				id: row.id,
				packId: packIdFor(row.asset?.id) ?? null,
				title: row.asset?.title ?? null,
				type: row.asset?.type ?? null,
				version: row.version ?? null,
				status: row.status ?? null,
				bytes: row.bytes ?? null,
				startedAt: row.started_at ?? null,
				finishedAt: row.finished_at ?? null,
				thisDevice: !!device.deviceId && row.device_id === device.deviceId,
			})),
		};
	}

	// ---------- installs mirror ----------

	async function mirrorInstall(pack) {
		const assetId = pack.libraryAssetId ?? assetIdFor(pack.id);
		if (!signedIn || !device.deviceId || !assetId || isOffline()) return false;
		await call("POST", "/me/installs", { device_id: device.deviceId, asset_id: assetId, version: pack.version }).catch(() => {});
		return true;
	}

	async function mirrorUninstall(packId) {
		const assetId = assetIdFor(packId);
		if (!signedIn || !device.deviceId || !assetId || isOffline()) return false;
		await call("DELETE", `/me/installs/${encodeURIComponent(assetId)}?device_id=${encodeURIComponent(device.deviceId)}`).catch(() => {});
		return true;
	}

	// ---------- live sync (SSE) ----------

	let stream = null; // { controller }
	let retryTimer = null;
	let attempt = 0;
	let wanted = false;
	let changeTimer = null;

	function catalogChanged() {
		// Coalesce bursts (a bulk publish sends many events).
		if (changeTimer) return;
		changeTimer = setTimeout(() => {
			changeTimer = null;
			onCatalogChange();
		}, 250);
		changeTimer.unref?.();
	}

	function handleEvent({ event, data, id }) {
		if (event === "bye") return "bye";
		if (event !== "sync" && event !== "message") return null;
		let parsed;
		try {
			parsed = JSON.parse(data);
		} catch {
			return null;
		}
		const seq = Number(parsed?.seq ?? id);
		if (Number.isFinite(seq) && seq > (sync.seq ?? 0)) {
			sync = { seq };
			writeJson(file("library-sync.json"), sync);
		}
		if (CATALOG_OPS.has(parsed?.op)) catalogChanged();
		return null;
	}

	async function connect() {
		retryTimer = null;
		if (!wanted || isOffline()) {
			live = "off";
			emit();
			return;
		}
		const controller = new AbortController();
		stream = { controller };
		live = attempt ? "reconnecting" : "connecting";
		emit();
		let bye = false;
		try {
			const since = sync.seq ?? 0;
			const res = await fetchImpl(`${base}/sync/stream?since=${encodeURIComponent(since)}`, {
				headers: { Accept: "text/event-stream", "Last-Event-ID": String(since), "X-App-Version": appVersion },
				signal: controller.signal,
			});
			if (!res.ok || !res.body) throw new Error(`Sync stream answered ${res.status}`);
			attempt = 0;
			live = "connected";
			emit();
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let current = { event: "message", data: [], id: null };
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let nl;
				while ((nl = buffer.search(/\r?\n/)) >= 0) {
					const line = buffer.slice(0, nl);
					buffer = buffer.slice(nl + (buffer[nl] === "\r" ? 2 : 1));
					if (line === "") {
						if (current.data.length || current.event === "bye") {
							if (handleEvent({ event: current.event, data: current.data.join("\n"), id: current.id }) === "bye") bye = true;
						}
						current = { event: "message", data: [], id: null };
						continue;
					}
					if (line.startsWith(":")) continue;
					const colon = line.indexOf(":");
					const field = colon < 0 ? line : line.slice(0, colon);
					const val = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
					if (field === "event") current.event = val;
					else if (field === "data") current.data.push(val);
					else if (field === "id") current.id = val;
				}
			}
		} catch {
			// Network error or abort: reconnect below unless stopped.
		}
		if (stream?.controller === controller) stream = null;
		if (!wanted) {
			live = "off";
			emit();
			return;
		}
		// `bye` is the server's normal 5-minute close: come straight back.
		const delay = bye ? 0 : Math.min(backoff.maxMs, backoff.baseMs * 2 ** attempt);
		if (!bye) attempt += 1;
		live = "reconnecting";
		emit();
		retryTimer = setTimeout(connect, delay);
		retryTimer.unref?.();
	}

	function startStream() {
		if (wanted) return;
		wanted = true;
		attempt = 0;
		void connect();
	}

	function stopStream() {
		wanted = false;
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = null;
		stream?.controller.abort();
		stream = null;
		live = "off";
		emit();
	}

	// ---------- sign-in ----------

	/**
	 * Follow the app's account state. On sign-in: register the device, union
	 * favorites, mirror what is installed, and start the live stream.
	 */
	async function setSignedIn(next, { account = null, installed = [] } = {}) {
		const was = signedIn;
		signedIn = !!next;
		accountId = account ?? accountId;
		if (signedIn && !was) {
			emit();
			await registerDevice();
			await syncFavorites();
			for (const pack of installed) await mirrorInstall(pack);
			if (!isOffline()) startStream();
		} else if (!signedIn && was) {
			stopStream();
			deviceError = null;
			emit();
		}
		return getState();
	}

	/** Network came back / went away. */
	function setOnline(online) {
		if (!signedIn) return;
		if (online) {
			if (deviceStatus !== "registered") void registerDevice();
			startStream();
		} else stopStream();
	}

	return {
		getState,
		fingerprintHash,
		registerDevice,
		downloadHeaders,
		requestGrant,
		completeDownload,
		setFavorite,
		syncFavorites,
		history,
		mirrorInstall,
		mirrorUninstall,
		startStream,
		stopStream,
		setSignedIn,
		setOnline,
		lastSeq: () => sync.seq ?? 0,
	};
}

module.exports = { createLibraryAccount, LibraryApiError, LIBRARY_API, CATALOG_OPS };
