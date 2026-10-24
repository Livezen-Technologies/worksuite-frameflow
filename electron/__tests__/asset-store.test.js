// node --test electron/__tests__  (also runs under bun test)
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const io = require("../asset-pack-io");
const { createAssetStore } = require("../asset-store");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "pem" });
const PRIV = privateKey.export({ type: "pkcs8", format: "pem" });

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "wsc-assets-"));

function makePack({ id = "demo-pack", version = "1.0.0", extra = [] } = {}) {
	const zip = io.createZip([
		{ name: "pack.json", data: JSON.stringify({ id, version, type: "motion" }) },
		{ name: "index.json", data: JSON.stringify({ schema: 1, assets: [{ id: "a1" }] }) },
		{ name: "cat/a1/a1.json", data: JSON.stringify({ v: "5.7.4", layers: [] }) },
		...extra,
	]);
	return {
		zip,
		entry: {
			id,
			type: "motion",
			version,
			title: "Demo",
			description: "Demo pack",
			tags: { en: ["demo"], si: [], ta: [] },
			languages: ["en"],
			sizeBytes: zip.length,
			sha256: io.sha256(zip),
			licence: "MIT",
			minAppVersion: "1.0.0",
			thumbnailUrl: null,
			previewUrl: null,
			files: `packs/${id}-${version}.zip`,
			plan: "free",
		},
	};
}

/** A fake download center: catalog + sig + zips, honouring Range and ETag. */
function server({ packs, sign = true, tamper = false }) {
	const catalog = JSON.stringify({ schema: 1, channel: "stable", packs: packs.map((p) => p.entry) });
	const sig = sign ? io.signCatalog(catalog, PRIV) : "";
	const calls = [];
	const etag = `"${io.sha256(catalog).slice(0, 8)}"`;
	const fetchImpl = async (url, init = {}) => {
		calls.push({ url, headers: init.headers ?? {} });
		if (url.endsWith("catalog.json")) {
			if (init.headers?.["If-None-Match"] === etag) return new Response(null, { status: 304 });
			return new Response(tamper ? catalog.replace("Demo pack", "Evil pack") : catalog, { headers: { etag } });
		}
		if (url.endsWith("catalog.json.sig")) return sign ? new Response(sig) : new Response("", { status: 404 });
		const pack = packs.find((p) => url.endsWith(p.entry.files));
		if (!pack) return new Response("nope", { status: 404 });
		const range = /bytes=(\d+)-/.exec(init.headers?.Range ?? "");
		if (range) return new Response(pack.zip.subarray(Number(range[1])), { status: 206 });
		return new Response(pack.zip);
	};
	return { fetchImpl, calls };
}

test("signature verify: good and bad", () => {
	const data = '{"schema":1,"packs":[]}';
	const sig = io.signCatalog(data, PRIV);
	assert.equal(io.verifyCatalog(data, sig, PUB), true);
	assert.equal(io.verifyCatalog(`${data} `, sig, PUB), false);
	assert.equal(io.verifyCatalog(data, "AAAA", PUB), false);
	const other = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
	assert.equal(io.verifyCatalog(data, sig, other), false);
});

test("catalog shape checks", () => {
	const { entry } = makePack();
	assert.deepEqual(io.catalogProblems({ schema: 1, packs: [entry] }), []);
	assert.ok(io.catalogProblems({ schema: 1, packs: [{ ...entry, type: "virus" }] }).length);
	assert.ok(io.catalogProblems({ schema: 1, packs: [entry, entry] }).some((p) => p.includes("duplicated")));
});

test("zip round trip and deterministic bytes", () => {
	const entries = [{ name: "a.txt", data: "hello ".repeat(100) }, { name: "b/c.bin", data: Buffer.from([1, 2, 3]) }];
	const a = io.createZip(entries);
	assert.equal(io.sha256(a), io.sha256(io.createZip(entries)));
	const out = io.readZip(a);
	assert.equal(out[0].data.toString(), "hello ".repeat(100));
	assert.deepEqual([...out[1].data], [1, 2, 3]);
});

test("unzip rejects path traversal, absolute paths and symlinks", () => {
	for (const bad of ["../evil.txt", "a/../../evil", "/etc/passwd", "C:/x", "a\\..\\b"]) assert.equal(io.safeEntryName(bad), null, bad);
	// Hand-craft a zip with a traversal name (createZip refuses to write one).
	const good = io.createZip([{ name: "xx/evil.txt", data: "x" }]);
	const evil = Buffer.from(good.toString("latin1").split("xx/evil.txt").join("../evil.txt"), "latin1");
	const dest = tmp();
	assert.throws(() => io.extractZip(evil, path.join(dest, "out")), /Unsafe path/);
	assert.equal(fs.existsSync(path.join(dest, "evil.txt")), false);
	// Symlink: set external attributes to S_IFLNK.
	const link = Buffer.from(io.createZip([{ name: "link", data: "/etc/passwd" }]));
	const central = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
	link.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
	assert.throws(() => io.readZip(link), /Symlinks/);
});

test("unzip rejects corrupted data (crc)", () => {
	const zip = Buffer.from(io.createZip([{ name: "a.bin", data: Buffer.from([9, 9, 9, 9]) }]));
	zip[30 + "a.bin".length] ^= 0xff;
	assert.throws(() => io.readZip(zip), /Checksum|Size/);
});

test("semver", () => {
	assert.equal(io.compareSemver("1.2.0", "1.10.0"), -1);
	assert.equal(io.compareSemver("2.0.0", "2.0.0-beta.1"), 1);
	assert.equal(io.compareSemver("1.0.0", "1.0.0"), 0);
});

test("catalog: verified, cached with ETag, offline falls back to cache", async () => {
	const root = tmp();
	const srv = server({ packs: [makePack()] });
	let offline = false;
	const store = createAssetStore({ root, fetchImpl: srv.fetchImpl, publicKey: PUB, appVersion: "1.0.0", isOffline: () => offline });
	let state = await store.refreshCatalog();
	assert.equal(state.catalogStatus.state, "ready");
	assert.equal(state.catalog.packs[0].id, "demo-pack");
	state = await store.refreshCatalog();
	assert.match(srv.calls.at(-1).headers["If-None-Match"], /^"[0-9a-f]{8}"$/);
	offline = true;
	state = await store.refreshCatalog();
	assert.equal(state.catalogStatus.stale, true);
	assert.equal(state.catalog.packs.length, 1);
});

test("catalog with a bad signature is rejected", async () => {
	const store = createAssetStore({ root: tmp(), fetchImpl: server({ packs: [makePack()], tamper: true }).fetchImpl, publicKey: PUB });
	const state = await store.refreshCatalog();
	assert.equal(state.catalogStatus.state, "error");
	assert.equal(state.catalogStatus.code, "bad-signature");
	assert.equal(state.catalog, null);
	const unsigned = createAssetStore({ root: tmp(), fetchImpl: server({ packs: [makePack()], sign: false }).fetchImpl, publicKey: PUB });
	assert.equal((await unsigned.refreshCatalog()).catalog, null);
});

test("install, serve, uninstall; index persists", async () => {
	const root = tmp();
	const pack = makePack();
	const store = createAssetStore({ root, fetchImpl: server({ packs: [pack] }).fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store.refreshCatalog();
	await store.install("demo-pack");
	assert.equal(store.getState().installed["demo-pack"].version, "1.0.0");
	assert.ok(fs.existsSync(path.join(root, "demo-pack", "1.0.0", "cat", "a1", "a1.json")));
	assert.ok(store.resolveAssetUrl("wsc-asset://demo-pack/1.0.0/cat/a1/a1.json"));
	assert.equal(store.resolveAssetUrl("wsc-asset://demo-pack/1.0.0/../../installed.json"), null);
	assert.equal(store.resolveAssetUrl("wsc-asset://demo-pack/1.0.0/%2e%2e/%2e%2e/installed.json"), null);
	assert.equal(store.resolveAssetUrl("wsc-asset://other/1.0.0/x"), null);
	const reopened = createAssetStore({ root, publicKey: PUB });
	assert.equal(reopened.getState().installed["demo-pack"].version, "1.0.0");
	store.uninstall("demo-pack");
	assert.equal(store.getState().installed["demo-pack"], undefined);
	assert.equal(fs.existsSync(path.join(root, "demo-pack")), false);
	assert.throws(() => store.uninstall("../x"), /Invalid pack id/);
});

test("sha256 mismatch is rejected and nothing installs", async () => {
	const root = tmp();
	const pack = makePack();
	pack.entry = { ...pack.entry, sha256: "0".repeat(64) };
	const store = createAssetStore({ root, fetchImpl: server({ packs: [pack] }).fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store.refreshCatalog();
	await assert.rejects(store.install("demo-pack"), /sha256/);
	assert.equal(store.getState().installed["demo-pack"], undefined);
	assert.equal(fs.existsSync(path.join(root, "demo-pack", "1.0.0")), false);
});

test("resume uses an HTTP Range request", async () => {
	const root = tmp();
	const pack = makePack();
	const srv = server({ packs: [pack] });
	const store = createAssetStore({ root, fetchImpl: srv.fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store.refreshCatalog();
	fs.mkdirSync(path.join(root, "downloads"), { recursive: true });
	fs.writeFileSync(path.join(root, "downloads", "demo-pack-1.0.0.zip.part"), pack.zip.subarray(0, 100));
	await store.resume("demo-pack");
	assert.equal(srv.calls.find((c) => c.url.endsWith(".zip")).headers.Range, "bytes=100-");
	assert.equal(store.getState().installed["demo-pack"].version, "1.0.0");
});

test("version bump keeps the old folder until clear unused", async () => {
	const root = tmp();
	const v1 = makePack();
	const store1 = createAssetStore({ root, fetchImpl: server({ packs: [v1] }).fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store1.refreshCatalog();
	await store1.install("demo-pack");
	const v2 = makePack({ version: "1.1.0" });
	const store2 = createAssetStore({ root, fetchImpl: server({ packs: [v2] }).fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store2.refreshCatalog();
	assert.equal(store2.updatesAvailable().length, 1);
	await store2.updateAll();
	assert.equal(store2.getState().installed["demo-pack"].version, "1.1.0");
	assert.ok(store2.resolveAssetUrl("wsc-asset://demo-pack/1.0.0/cat/a1/a1.json"), "old version still served");
	const { freedBytes } = store2.clearUnused();
	assert.ok(freedBytes > 0);
	assert.equal(store2.resolveAssetUrl("wsc-asset://demo-pack/1.0.0/cat/a1/a1.json"), null);
});

test("pack whose pack.json doesn't match the catalog is rejected", async () => {
	const pack = makePack();
	const zip = io.createZip([{ name: "pack.json", data: JSON.stringify({ id: "something-else", version: "1.0.0" }) }]);
	pack.zip = zip;
	pack.entry = { ...pack.entry, sizeBytes: zip.length, sha256: io.sha256(zip) };
	const store = createAssetStore({ root: tmp(), fetchImpl: server({ packs: [pack] }).fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store.refreshCatalog();
	await assert.rejects(store.install("demo-pack"), /pack.json/);
});

test("minAppVersion and offline block installs", async () => {
	const pack = makePack();
	pack.entry.minAppVersion = "9.0.0";
	const store = createAssetStore({ root: tmp(), fetchImpl: server({ packs: [pack] }).fetchImpl, publicKey: PUB, appVersion: "1.0.0" });
	await store.refreshCatalog();
	await assert.rejects(store.install("demo-pack"), /9\.0\.0/);
});

test("built catalog from the repo packs verifies", async () => {
	const { buildCatalog } = await import("../../scripts/assets/build-catalog.mjs");
	const out = tmp();
	const { dest, catalog } = buildCatalog({ out, signingKey: PRIV, generatedAt: "2026-01-01T00:00:00Z" });
	const text = fs.readFileSync(path.join(dest, "catalog.json"), "utf8");
	assert.equal(io.verifyCatalog(text, fs.readFileSync(path.join(dest, "catalog.json.sig"), "utf8"), PUB), true);
	const ids = catalog.packs.map((p) => p.id).sort();
	assert.deepEqual(ids, ["subscribe-buttons", "worksuite-essentials", "worksuite-sfx"]);
	const sub = catalog.packs.find((p) => p.id === "subscribe-buttons");
	const zip = fs.readFileSync(path.join(dest, sub.files));
	assert.equal(io.sha256(zip), sub.sha256);
	const names = io.readZip(zip).map((e) => e.name);
	assert.ok(names.includes("pack.json") && names.includes("index.json"));
	assert.ok(names.includes("subscribe-buttons/sub-avatar-bar/asset.json"));
});

test("catalog accepts the asset library's graphics, stickers and brand-kit packs", () => {
	const pack = (type) => ({ ...makePack().entry, id: `lib-${type}`, type });
	const catalog = { schema: 1, channel: "stable", packs: ["graphics", "stickers", "brand-kits"].map(pack) };
	assert.deepEqual(io.catalogProblems(catalog), []);
	assert.deepEqual(io.catalogProblems({ ...catalog, packs: [pack("holograms")] }), ["packs[0].type is invalid"]);
});

test("Pro packs are downloaded with the signed-in user's token; free packs without", async () => {
	const free = makePack({ id: "free-pack" });
	const pro = makePack({ id: "pro-pack" });
	pro.entry.plan = "pro";
	const { fetchImpl, calls } = server({ packs: [free, pro] });
	const store = createAssetStore({ root: tmp(), fetchImpl, publicKey: PUB, appVersion: "9.9.9", getAccessToken: async () => "tok-123" });
	await store.refreshCatalog();
	await store.install("free-pack");
	await store.install("pro-pack");
	const auth = (id) => calls.find((c) => c.url.includes(id)).headers.Authorization;
	assert.equal(auth("free-pack"), undefined);
	assert.equal(auth("pro-pack"), "Bearer tok-123");
});
