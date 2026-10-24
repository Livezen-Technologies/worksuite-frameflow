// Builds the asset download center for one channel:
//   node scripts/assets/build-catalog.mjs [--channel stable|beta] [--out dist/assets] [--unsigned]
//
// Every pack folder under assets/packs/<type>/<pack-id>/ has a pack.json.
// Its files are either in the folder itself, or (for packs carved out of
// the bundled Worksuite pack) picked from assets/worksuite-pack by
// `source`. Each pack becomes packs/<id>-<version>.zip (deterministic bytes)
// plus a thumbnail, and catalog.json lists them with size and sha256.
// catalog.json.sig is the base64 Ed25519 signature of catalog.json made with
// the PEM private key in ASSET_SIGNING_KEY (CI only); --unsigned skips it
// for local development (the app rejects unsigned catalogs unless
// WSC_ASSET_PUBLIC_KEY points at your own dev key).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const io = require("../../electron/asset-pack-io.js");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PACKS_DIR = join(root, "assets", "packs");

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : fallback;
}

function walk(dir, base = dir) {
	const out = [];
	for (const name of readdirSync(dir).sort()) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p, base));
		else if (name !== "README.md" && !name.startsWith(".")) out.push(relative(base, p).split("\\").join("/"));
	}
	return out;
}

/** Pack folders: assets/packs/<type>/<id>/pack.json. */
export function listPacks(dir = PACKS_DIR) {
	const packs = [];
	for (const type of readdirSync(dir).sort()) {
		const typeDir = join(dir, type);
		if (!statSync(typeDir).isDirectory()) continue;
		for (const id of readdirSync(typeDir).sort()) {
			const manifestPath = join(typeDir, id, "pack.json");
			if (!existsSync(manifestPath)) continue;
			packs.push({ type, id, dir: join(typeDir, id), manifest: JSON.parse(readFileSync(manifestPath, "utf8")) });
		}
	}
	return packs;
}

/** Problems with a pack folder (empty when valid). */
export function packProblems({ type, id, dir, manifest }) {
	const problems = [];
	const fail = (m) => problems.push(`${type}/${id}: ${m}`);
	if (manifest.id !== id) fail(`pack.json id "${manifest.id}" doesn't match the folder`);
	if (manifest.type !== type) fail(`pack.json type "${manifest.type}" doesn't match the folder`);
	if (!io.PACK_TYPES.includes(type)) fail(`unknown type ${type}`);
	if (!io.SEMVER.test(manifest.version ?? "")) fail("version isn't semver");
	if (!io.SEMVER.test(manifest.minAppVersion ?? "")) fail("minAppVersion isn't semver");
	if (!["free", "pro"].includes(manifest.plan)) fail("plan must be free or pro");
	for (const key of ["title", "description", "licence"]) if (!manifest[key]) fail(`${key} is missing`);
	for (const lang of ["en", "si", "ta"]) if (!Array.isArray(manifest.tags?.[lang])) fail(`tags.${lang} must be a list`);
	try {
		const files = packFiles({ dir, manifest });
		if (files.length < 2) fail("pack has no files");
	} catch (error) {
		fail(error.message);
	}
	return problems;
}

/** The files of a pack as { name, data }, pack.json and index.json first. */
export function packFiles({ dir, manifest }) {
	const { source, builtin: _builtin, ...publicManifest } = manifest;
	const entries = [];
	let index = null;
	if (source) {
		const src = join(root, "assets", source.pack);
		const full = JSON.parse(readFileSync(join(src, "index.json"), "utf8"));
		if (source.categories) {
			const assets = full.assets.filter((a) => source.categories.includes(a.category));
			if (!assets.length) throw new Error("source selects no assets");
			index = {
				...full,
				name: manifest.title,
				categories: full.categories.filter((c) => source.categories.includes(c.id)),
				assets,
			};
			for (const asset of assets) for (const f of walk(join(src, asset.path))) entries.push({ name: `${asset.path}/${f}`, data: readFileSync(join(src, asset.path, f)) });
			// Asset sound cues point at ../../sounds/, so the sounds travel along.
			const sounds = new Set(assets.flatMap((a) => (a.sounds ?? []).map((s) => s.file)));
			for (const f of [...sounds].sort()) entries.push({ name: f, data: readFileSync(join(src, f)) });
		}
		if (source.sounds) {
			const files = walk(join(src, "sounds")).filter((f) => f.endsWith(".wav"));
			index = {
				schema: 1,
				name: manifest.title,
				sounds: files.map((f) => ({ id: f.replace(/\.wav$/, ""), name: f.replace(/\.wav$/, ""), file: `sounds/${f}`, sha256: io.sha256(readFileSync(join(src, "sounds", f))) })),
			};
			for (const f of files) entries.push({ name: `sounds/${f}`, data: readFileSync(join(src, "sounds", f)) });
		}
	}
	for (const f of walk(dir)) if (f !== "pack.json") entries.push({ name: f, data: readFileSync(join(dir, f)) });
	if (index && !entries.some((e) => e.name === "index.json")) entries.unshift({ name: "index.json", data: Buffer.from(`${JSON.stringify(index, null, "\t")}\n`) });
	entries.unshift({ name: "pack.json", data: Buffer.from(`${JSON.stringify(publicManifest, null, "\t")}\n`) });
	return entries;
}

function thumbnailOf(entries) {
	return entries.find((e) => e.name === "thumbnail.png") ?? entries.find((e) => e.name.endsWith("/thumbnail.png")) ?? null;
}

export function buildCatalog({ channel = "stable", out = join(root, "dist", "assets"), signingKey = null, generatedAt = new Date().toISOString() } = {}) {
	const dest = join(out, channel);
	rmSync(dest, { recursive: true, force: true });
	mkdirSync(join(dest, "packs"), { recursive: true });
	const packs = listPacks();
	const problems = packs.flatMap(packProblems);
	if (problems.length) throw new Error(problems.join("\n"));
	const catalog = { schema: 1, channel, generatedAt, packs: [] };
	for (const pack of packs) {
		const { manifest } = pack;
		const entries = packFiles(pack);
		const zip = io.createZip(entries);
		const base = `packs/${manifest.id}-${manifest.version}`;
		writeFileSync(join(dest, `${base}.zip`), zip);
		const thumb = thumbnailOf(entries);
		if (thumb) writeFileSync(join(dest, `${base}.png`), thumb.data);
		const index = JSON.parse(entries.find((e) => e.name === "index.json")?.data ?? "{}");
		catalog.packs.push({
			id: manifest.id,
			type: manifest.type,
			version: manifest.version,
			title: manifest.title,
			description: manifest.description,
			tags: manifest.tags,
			languages: manifest.languages ?? [],
			sizeBytes: zip.length,
			sha256: io.sha256(zip),
			licence: manifest.licence,
			minAppVersion: manifest.minAppVersion,
			thumbnailUrl: thumb ? `${base}.png` : null,
			previewUrl: thumb ? `${base}.png` : null,
			files: `${base}.zip`,
			plan: manifest.plan,
			assetCount: (index.assets ?? index.sounds ?? []).length,
			assetIds: (index.assets ?? index.sounds ?? []).map((a) => a.id),
			...(manifest.builtin ? { builtin: true } : {}),
		});
	}
	const bad = io.catalogProblems(catalog);
	if (bad.length) throw new Error(bad.join("\n"));
	const text = `${JSON.stringify(catalog, null, "\t")}\n`;
	writeFileSync(join(dest, "catalog.json"), text);
	if (signingKey) writeFileSync(join(dest, "catalog.json.sig"), `${io.signCatalog(text, signingKey)}\n`);
	return { dest, catalog, signed: !!signingKey };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const channel = arg("--channel", "stable");
	const unsigned = process.argv.includes("--unsigned");
	const validateOnly = process.argv.includes("--validate");
	if (validateOnly) {
		const problems = listPacks().flatMap(packProblems);
		if (problems.length) {
			console.error(problems.join("\n"));
			process.exit(1);
		}
		console.log(`Asset packs are valid (${listPacks().length}).`);
		process.exit(0);
	}
	const key = process.env.ASSET_SIGNING_KEY;
	if (!key && !unsigned) {
		console.error("ASSET_SIGNING_KEY isn't set. Use --unsigned for a local build.");
		process.exit(1);
	}
	const { dest, catalog, signed } = buildCatalog({ channel, out: arg("--out", join(root, "dist", "assets")), signingKey: unsigned ? null : key });
	console.log(`Built ${catalog.packs.length} packs in ${relative(root, dest)} (${signed ? "signed" : "unsigned"})`);
}
