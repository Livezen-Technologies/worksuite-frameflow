// Checks the Worksuite Assets pack:
//   bun scripts/assets/validate-worksuite-pack.ts
// Every asset has its Lottie JSON, thumbnail and metadata; the JSON parses
// and has no text layers; every colour it uses is one of its colour slots;
// files are a sensible size; and index.json hashes match.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectLottieColors, hasTextLayers, parseLottie } from "../../apps/web/src/lottie/colors";

const MAX_JSON_BYTES = 150 * 1024;
const REQUIRED_META = ["schema", "id", "name", "category", "type", "file", "thumbnail", "license", "description", "tags", "durationSec", "loop", "aspect", "colors"];

function pngSize(file: string): { width: number; height: number } | null {
	const buf = readFileSync(file);
	if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function validatePack(packDir: string, { requireThumbnails = true } = {}): string[] {
	const problems: string[] = [];
	const ids = new Set<string>();
	const categories = readdirSync(packDir).filter((d) => statSync(join(packDir, d)).isDirectory());
	for (const category of categories) {
		for (const id of readdirSync(join(packDir, category))) {
			const dir = join(packDir, category, id);
			if (!statSync(dir).isDirectory()) continue;
			const fail = (msg: string) => problems.push(`${category}/${id}: ${msg}`);
			if (ids.has(id)) fail("duplicate id");
			ids.add(id);

			const metaPath = join(dir, "asset.json");
			if (!existsSync(metaPath)) {
				fail("missing asset.json");
				continue;
			}
			const meta = JSON.parse(readFileSync(metaPath, "utf8"));
			for (const key of REQUIRED_META) if (!(key in meta)) fail(`asset.json is missing "${key}"`);
			if (meta.id !== id) fail(`asset.json id "${meta.id}" doesn't match its folder`);
			if (meta.category !== category) fail(`asset.json category "${meta.category}" doesn't match its folder`);
			if (meta.type !== "lottie") fail("type must be lottie");
			if (!Array.isArray(meta.tags) || meta.tags.length === 0) fail("needs tags");
			if (!(meta.durationSec >= 2 && meta.durationSec <= 4)) fail(`durationSec ${meta.durationSec} is outside 2–4 s`);

			const jsonPath = join(dir, meta.file ?? `${id}.json`);
			if (!existsSync(jsonPath)) {
				fail("missing Lottie JSON");
				continue;
			}
			const size = statSync(jsonPath).size;
			if (size > MAX_JSON_BYTES) fail(`JSON is ${Math.round(size / 1024)} KB (limit 150 KB)`);
			let lottie;
			try {
				lottie = parseLottie(readFileSync(jsonPath, "utf8"));
			} catch (error) {
				fail(`JSON doesn't parse as Lottie: ${(error as Error).message}`);
				continue;
			}
			if (hasTextLayers(lottie)) fail("has a text layer");
			if (readFileSync(jsonPath, "utf8").includes('"ty":5')) fail('contains "ty":5');
			if (lottie.fr !== 30) fail(`frame rate ${lottie.fr}, expected 30`);
			if (Math.abs((lottie.op - lottie.ip) / lottie.fr - meta.durationSec) > 0.05) fail("length doesn't match durationSec");
			if (lottie.w !== meta.width || lottie.h !== meta.height) fail("size doesn't match metadata");

			const slots = new Set<string>((meta.colors ?? []).map((s: { default: string }) => s.default.toUpperCase()));
			for (const s of meta.colors ?? []) {
				if (!/^#[0-9A-F]{6}$/i.test(s.default)) fail(`colour slot ${s.id} isn't #RRGGBB`);
			}
			const used = collectLottieColors(lottie);
			for (const color of used) if (!slots.has(color)) fail(`uses ${color}, which isn't a colour slot`);
			for (const color of slots) if (!used.includes(color)) fail(`colour slot ${color} isn't used`);

			const thumbPath = join(dir, meta.thumbnail ?? "thumbnail.png");
			if (!existsSync(thumbPath)) {
				if (requireThumbnails) fail("missing thumbnail.png");
			} else {
				const dims = pngSize(thumbPath);
				if (!dims) fail("thumbnail isn't a PNG");
				else if (dims.width !== 512 || dims.height !== 512) fail(`thumbnail is ${dims.width}×${dims.height}, expected 512×512`);
			}
		}
	}

	const indexPath = join(packDir, "index.json");
	if (!existsSync(indexPath)) problems.push("missing index.json");
	else {
		const index = JSON.parse(readFileSync(indexPath, "utf8"));
		if (index.assets.length !== ids.size) problems.push(`index.json lists ${index.assets.length} assets, found ${ids.size}`);
		for (const asset of index.assets) {
			for (const [file, { sha256 }] of Object.entries(asset.files as Record<string, { sha256: string }>)) {
				const path = join(packDir, asset.path, file);
				if (!existsSync(path)) problems.push(`index.json: ${asset.path}/${file} is missing`);
				else if (createHash("sha256").update(readFileSync(path)).digest("hex") !== sha256) problems.push(`index.json: ${asset.path}/${file} hash is out of date`);
			}
		}
	}
	return problems;
}

if (import.meta.main) {
	const packDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "worksuite-pack");
	const problems = validatePack(packDir);
	if (problems.length) {
		console.error(problems.join("\n"));
		process.exit(1);
	}
	console.log("Worksuite Assets pack is valid.");
}
