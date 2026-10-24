// node --test electron/__tests__  — library account: devices, favorites, installs mirror, live sync.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const io = require("../asset-pack-io");
const { createLibraryAccount } = require("../library-account");
const { createAssetStore } = require("../asset-store");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "wsc-library-"));
const API = "https://library.test";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake library API that records calls. `routes` maps "METHOD /path" (no query) to a handler. */
function fakeApi(routes = {}) {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		const u = new URL(url);
		const key = `${init.method ?? "GET"} ${u.pathname.replace("/api/v1", "")}`;
		const body = init.body ? JSON.parse(init.body) : null;
		calls.push({ key, url, headers: init.headers ?? {}, body });
		const handler = routes[key];
		if (!handler) return new Response(null, { status: 204 });
		return handler({ url: u, body, headers: init.headers ?? {} });
	};
	return { fetchImpl, calls };
}

const catalogPacks = [
	{ id: "lut-pack", libraryAssetId: "asset-lut" },
	{ id: "sfx-pack", libraryAssetId: "asset-sfx" },
	{ id: "fx-pack", libraryAssetId: "asset-fx" },
];

test("device registration: fingerprint is the hash of a stored random install id", async () => {
	const root = tmp();
	const api = fakeApi({ "POST /devices/register": () => json({ id: "dev-1", name: "laptop" }, 201) });
	const lib = createLibraryAccount({ root, apiBase: API, fetchImpl: api.fetchImpl, getAccessToken: async () => "tok", appVersion: "1.2.0", platform: "darwin", deviceName: "laptop" });
	const stored = JSON.parse(fs.readFileSync(path.join(root, "library-device.json"), "utf8"));
	assert.match(stored.installId, /^[0-9a-f]{64}$/);
	assert.equal(lib.fingerprintHash, crypto.createHash("sha256").update(stored.installId).digest("hex"));
	await lib.setSignedIn(true, { account: "u1" });
	lib.stopStream();
	const reg = api.calls.find((c) => c.key === "POST /devices/register");
	assert.deepEqual(reg.body, { fingerprint_hash: lib.fingerprintHash, os: "macos", app_version: "1.2.0", name: "laptop" });
	assert.equal(reg.headers.Authorization, "Bearer tok");
	assert.equal(lib.getState().device.status, "registered");
	assert.equal(lib.getState().device.id, "dev-1");
	// Same install, new start: same fingerprint, device id kept.
	const again = createLibraryAccount({ root, apiBase: API, fetchImpl: api.fetchImpl });
	assert.equal(again.fingerprintHash, lib.fingerprintHash);
	assert.deepEqual(again.downloadHeaders(), { "X-Device-Id": "dev-1" });
});

test("device limit is reported clearly", async () => {
	const api = fakeApi({
		"POST /devices/register": () => json({ error: { code: "DEVICE_LIMIT", message: "limit", details: [{ field: "device", rule: "device.limit", value: 3 }] } }, 409),
	});
	const lib = createLibraryAccount({ root: tmp(), apiBase: API, fetchImpl: api.fetchImpl, getAccessToken: async () => "tok" });
	await lib.setSignedIn(true);
	lib.stopStream();
	const { device } = lib.getState();
	assert.equal(device.status, "limit");
	assert.equal(device.error.code, "DEVICE_LIMIT");
	assert.equal(device.error.limit, 3);
	assert.match(device.error.message, /allows 3 devices/);
});

test("download grants send X-Device-Id; DEVICE_LIMIT becomes a clear error", async () => {
	let limit = false;
	const api = fakeApi({
		"POST /devices/register": () => json({ id: "dev-9" }, 201),
		"POST /assets/asset-lut/download": () =>
			limit ? json({ error: { code: "DEVICE_LIMIT", message: "x", details: [{ rule: "device.limit", value: 2 }] } }, 409) : json({ url: "/feed/stable/packs/lut-pack-1.0.0.zip?sig=abc", download_id: "dl1" }),
	});
	const lib = createLibraryAccount({ root: tmp(), apiBase: API, fetchImpl: api.fetchImpl, getAccessToken: async () => "tok", getCatalogPacks: () => catalogPacks });
	await lib.setSignedIn(true);
	lib.stopStream();
	const grant = await lib.requestGrant({ id: "lut-pack", libraryAssetId: "asset-lut", version: "1.0.0" });
	assert.equal(grant.url, `${API}/feed/stable/packs/lut-pack-1.0.0.zip?sig=abc`);
	const call = api.calls.find((c) => c.key === "POST /assets/asset-lut/download");
	assert.equal(call.headers["X-Device-Id"], "dev-9");
	assert.deepEqual(call.body, { version: "1.0.0", device_id: "dev-9" });
	limit = true;
	await assert.rejects(lib.requestGrant({ id: "lut-pack", libraryAssetId: "asset-lut", version: "1.0.0" }), (e) => e.code === "device-limit" && /allows 2 devices/.test(e.message));
	// Signed out: no grant, the feed URL is used.
	await lib.setSignedIn(false);
	assert.equal(await lib.requestGrant({ id: "lut-pack", libraryAssetId: "asset-lut", version: "1.0.0" }), null);
});

test("favorites: offline favorites are unioned on the first sign-in only", async () => {
	const root = tmp();
	const server = new Set(["asset-sfx"]);
	const api = fakeApi({
		"POST /devices/register": () => json({ id: "dev-1" }, 201),
		"GET /me/favorites": () => json({ data: [...server].map((id) => ({ id })) }),
	});
	const wrap = async (url, init = {}) => {
		const m = /\/me\/favorites\/([^/?]+)$/.exec(new URL(url).pathname);
		if (m && init.method === "PUT") server.add(decodeURIComponent(m[1]));
		if (m && init.method === "DELETE") server.delete(decodeURIComponent(m[1]));
		return api.fetchImpl(url, init);
	};
	let signedIn = false;
	const lib = createLibraryAccount({ root, apiBase: API, fetchImpl: wrap, getAccessToken: async () => (signedIn ? "tok" : null), getCatalogPacks: () => catalogPacks });
	// Offline / signed out: stored locally.
	await lib.setFavorite("lut-pack", true);
	await lib.setFavorite("local-only", true);
	assert.equal(api.calls.filter((c) => c.key.startsWith("PUT")).length, 0);
	signedIn = true;
	await lib.setSignedIn(true, { account: "u1" });
	lib.stopStream();
	assert.ok(server.has("asset-lut"), "offline favorite PUT to the server");
	assert.deepEqual(new Set(lib.getState().favorites), new Set(["lut-pack", "sfx-pack", "local-only"]));
	// Later the server drops one (removed on another device): not re-added, as the merge already happened.
	server.delete("asset-lut");
	await lib.syncFavorites();
	assert.deepEqual(new Set(lib.getState().favorites), new Set(["sfx-pack", "local-only"]));
	// Toggling while signed in goes straight to the server.
	await lib.setFavorite("fx-pack", true);
	assert.ok(server.has("asset-fx"));
	await lib.setFavorite("fx-pack", false);
	assert.ok(!server.has("asset-fx"));
	// Survives a restart.
	const again = createLibraryAccount({ root, apiBase: API, fetchImpl: wrap });
	assert.deepEqual(new Set(again.getState().favorites), new Set(["sfx-pack", "local-only"]));
});

test("download history maps rows to packs", async () => {
	const api = fakeApi({
		"POST /devices/register": () => json({ id: "dev-1" }, 201),
		"GET /me/downloads": ({ url }) => {
			assert.equal(url.searchParams.get("limit"), "20");
			return json({ data: [{ id: "d1", asset: { id: "asset-lut", title: "Film LUTs", type: "lut" }, version: "1.0.0", device_id: "dev-1", status: "installed", bytes: 10, started_at: "2026-10-01T00:00:00Z", finished_at: null }], next_cursor: "20" });
		},
	});
	const lib = createLibraryAccount({ root: tmp(), apiBase: API, fetchImpl: api.fetchImpl, getAccessToken: async () => "tok", getCatalogPacks: () => catalogPacks });
	assert.deepEqual((await lib.history()).data, []);
	await lib.setSignedIn(true);
	lib.stopStream();
	const page = await lib.history({ limit: 20 });
	assert.equal(page.next_cursor, "20");
	assert.equal(page.data[0].packId, "lut-pack");
	assert.equal(page.data[0].title, "Film LUTs");
	assert.equal(page.data[0].thisDevice, true);
});

// ---------- installs mirror, through the asset store ----------

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "pem" });
const PRIV = privateKey.export({ type: "pkcs8", format: "pem" });

function makePack({ id, version = "1.0.0", plan = "free", dependencies, libraryAssetId }) {
	const zip = io.createZip([
		{ name: "pack.json", data: JSON.stringify({ id, version, type: "luts" }) },
		{ name: "index.json", data: JSON.stringify({ items: [{ id: "a", file: "a.cube" }] }) },
		{ name: "a.cube", data: "LUT_3D_SIZE 2\n" },
	]);
	return {
		zip,
		entry: {
			id, type: "luts", version, title: id, description: id, tags: { en: [] }, languages: ["en"],
			sizeBytes: zip.length, sha256: io.sha256(zip), licence: "MIT", minAppVersion: "1.0.0",
			thumbnailUrl: null, previewUrl: null, files: `packs/${id}-${version}.zip`, plan,
			...(dependencies ? { dependencies } : {}), ...(libraryAssetId ? { libraryAssetId } : {}),
		},
	};
}

function feed(packs) {
	const catalog = JSON.stringify({ schema: 1, channel: "stable", packs: packs.map((p) => p.entry) });
	const sig = io.signCatalog(catalog, PRIV);
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		calls.push({ url, headers: init.headers ?? {} });
		if (url.endsWith("catalog.json")) return new Response(catalog);
		if (url.endsWith("catalog.json.sig")) return new Response(sig);
		const pack = packs.find((p) => new URL(url).pathname.endsWith(p.entry.files));
		return pack ? new Response(pack.zip) : new Response("nope", { status: 404 });
	};
	return { fetchImpl, calls };
}

test("installs are mirrored (POST/DELETE /me/installs); dependencies install first", async () => {
	const base = makePack({ id: "base-fonts", libraryAssetId: "asset-fonts" });
	const top = makePack({ id: "lut-pack", libraryAssetId: "asset-lut", dependencies: ["base-fonts"] });
	const cdn = feed([base, top]);
	const api = fakeApi({ "POST /devices/register": () => json({ id: "dev-7" }, 201) });
	let store;
	const lib = createLibraryAccount({ root: tmp(), apiBase: API, fetchImpl: api.fetchImpl, getAccessToken: async () => "tok", getCatalogPacks: () => store.getState().catalog?.packs ?? [] });
	store = createAssetStore({ root: tmp(), fetchImpl: cdn.fetchImpl, publicKey: PUB, assetBase: "https://cdn.test/assets", appVersion: "1.2.0", library: lib });
	await store.refreshCatalog();
	await lib.setSignedIn(true);
	lib.stopStream();
	assert.deepEqual(store.dependencyOrder("lut-pack"), ["base-fonts"]);
	await store.install("lut-pack");
	const zips = cdn.calls.filter((c) => c.url.endsWith(".zip")).map((c) => c.url.split("/").pop());
	assert.deepEqual(zips, ["base-fonts-1.0.0.zip", "lut-pack-1.0.0.zip"]);
	await new Promise((r) => setTimeout(r, 10));
	const posts = api.calls.filter((c) => c.key === "POST /me/installs").map((c) => c.body);
	assert.deepEqual(posts, [
		{ device_id: "dev-7", asset_id: "asset-fonts", version: "1.0.0" },
		{ device_id: "dev-7", asset_id: "asset-lut", version: "1.0.0" },
	]);
	assert.equal(store.getState().installed["lut-pack"].libraryAssetId, "asset-lut");
	store.uninstall("lut-pack");
	await new Promise((r) => setTimeout(r, 10));
	const del = api.calls.find((c) => c.key === "DELETE /me/installs/asset-lut");
	assert.ok(del);
	assert.equal(new URL(del.url).searchParams.get("device_id"), "dev-7");
	assert.ok(store.getState().library.signedIn);
});

test("Pro downloads use the grant URL with X-Device-Id", async () => {
	const pro = makePack({ id: "pro-pack", plan: "pro", libraryAssetId: "asset-pro" });
	const cdn = feed([pro]);
	const api = fakeApi({
		"POST /devices/register": () => json({ id: "dev-3" }, 201),
		"POST /assets/asset-pro/download": () => json({ url: "https://cdn.test/assets/stable/packs/pro-pack-1.0.0.zip?expires=1&sig=s", download_id: "dl" }),
	});
	let store;
	const lib = createLibraryAccount({ root: tmp(), apiBase: API, fetchImpl: api.fetchImpl, getAccessToken: async () => "tok", getCatalogPacks: () => store.getState().catalog?.packs ?? [] });
	store = createAssetStore({ root: tmp(), fetchImpl: cdn.fetchImpl, publicKey: PUB, assetBase: "https://cdn.test/assets", appVersion: "1.2.0", library: lib, getAccessToken: async () => "tok" });
	await store.refreshCatalog();
	await lib.setSignedIn(true);
	lib.stopStream();
	await store.install("pro-pack");
	const zip = cdn.calls.find((c) => c.url.includes(".zip"));
	assert.match(zip.url, /sig=s$/);
	assert.equal(zip.headers["X-Device-Id"], "dev-3");
	assert.equal(zip.headers.Authorization, undefined, "a signed grant needs no bearer token");
	await new Promise((r) => setTimeout(r, 10));
	assert.ok(api.calls.some((c) => c.key === "POST /downloads/dl/complete" && c.body.status === "installed"));
});

// ---------- live sync stream ----------

test("SSE: catalog events refresh right away; reconnects with backoff and the last seq", async () => {
	const requests = [];
	let connection = 0;
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://x");
		requests.push({ since: url.searchParams.get("since"), lastEventId: req.headers["last-event-id"] });
		connection += 1;
		res.writeHead(200, { "content-type": "text/event-stream" });
		if (connection === 1) {
			res.write(": ping\n\n");
			res.write(`event: sync\nid: 41\ndata: ${JSON.stringify({ seq: 41, op: "category_change" })}\n\n`);
			res.write(`event: sync\nid: 42\ndata: ${JSON.stringify({ seq: 42, op: "upsert", asset_id: "a" })}\n\n`);
			// Drop the connection (network error): the client backs off and comes back.
			setTimeout(() => res.destroy(), 30);
		} else if (connection === 2) {
			res.write(`event: sync\ndata: ${JSON.stringify({ seq: 43, op: "unpublish", asset_id: "a" })}\n\n`);
			res.write("event: bye\ndata: {}\n\n");
			res.end();
		} else {
			res.write(`event: sync\ndata: ${JSON.stringify({ seq: 44, op: "deprecate", asset_id: "b" })}\n\n`);
		}
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	const apiBase = `http://127.0.0.1:${server.address().port}`;
	const root = tmp();
	let refreshes = 0;
	const lib = createLibraryAccount({
		root,
		apiBase,
		fetchImpl: async (url, init = {}) => (url.includes("/sync/stream") ? fetch(url, init) : init.method === "POST" ? json({ id: "dev" }, 201) : json({ data: [] })),
		getAccessToken: async () => "tok",
		onCatalogChange: () => {
			refreshes += 1;
		},
		backoff: { baseMs: 20, maxMs: 100 },
	});
	try {
		await lib.setSignedIn(true);
		const until = async (cond, ms = 3000) => {
			const end = Date.now() + ms;
			while (!cond()) {
				if (Date.now() > end) throw new Error(`timed out: ${connection} ${lib.lastSeq()} ${refreshes} ${JSON.stringify(requests)}`);
				await new Promise((r) => setTimeout(r, 10));
			}
		};
		await until(() => connection >= 3 && lib.lastSeq() === 44 && refreshes >= 1);
		assert.equal(requests[0].since, "0");
		assert.equal(requests[1].since, "42", "reconnect resumes after the last seq");
		assert.equal(requests[1].lastEventId, "42");
		assert.equal(requests[2].since, "43", "after bye the client comes straight back");
		assert.equal(lib.getState().live, "connected");
		// Persisted for the next start.
		assert.equal(JSON.parse(fs.readFileSync(path.join(root, "library-sync.json"), "utf8")).seq, 44);
	} finally {
		lib.stopStream();
		await new Promise((r) => server.close(r));
		server.closeAllConnections?.();
	}
	assert.equal(lib.getState().live, "off");
});

test("SSE is not opened while signed out", async () => {
	const api = fakeApi();
	const lib = createLibraryAccount({ root: tmp(), apiBase: API, fetchImpl: api.fetchImpl });
	await lib.setSignedIn(false);
	assert.equal(api.calls.length, 0);
	assert.equal(lib.getState().live, "off");
});
