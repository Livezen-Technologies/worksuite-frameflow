// Text library packs (assets/packs/text-animations/*, assets/packs/text-templates/*).
// Each pack folder holds pack.json, categories.json and items/<id>.json; this
// builds the index.json the app and the download center read (categories +
// every item inlined, sorted by id) and runs the structural checks.
//   node scripts/assets/text-packs.mjs            validate every text pack
//   node scripts/assets/text-packs.mjs --write    also write index.json into each pack folder
// Full checks (effect ids, easings) run in apps/web: bun test src/text-library.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEXT_PACK_TYPES = ["text-animations", "text-templates"];
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function isTextPackDir(dir) {
	return existsSync(join(dir, "items")) && existsSync(join(dir, "categories.json"));
}

/** { index, problems } for one pack folder. */
export function buildTextPackIndex(dir) {
	const manifest = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));
	const categories = JSON.parse(readFileSync(join(dir, "categories.json"), "utf8"));
	const problems = [];
	const at = `${manifest.type}/${manifest.id}`;
	if (!Array.isArray(categories) || categories.some((c) => !c.id || !c.name?.en)) problems.push(`${at}: categories.json must be [{ id, name: { en, si, ta } }]`);
	const ids = new Set((categories ?? []).map((c) => c.id));
	const kind = manifest.type === "text-animations" ? "animation" : "template";
	const items = [];
	for (const file of readdirSync(join(dir, "items")).filter((f) => f.endsWith(".json")).sort()) {
		let item;
		try {
			item = JSON.parse(readFileSync(join(dir, "items", file), "utf8"));
		} catch (error) {
			problems.push(`${at}/items/${file}: ${error.message}`);
			continue;
		}
		const p = (m) => problems.push(`${at}/items/${file}: ${m}`);
		if (item.schema !== 1) p("schema must be 1");
		if (!ID.test(item.id ?? "")) p("bad id");
		if (`${item.id}.json` !== file) p("file name must be <id>.json");
		if (item.kind !== kind) p(`kind must be "${kind}" in a ${manifest.type} pack`);
		if (!item.name?.en) p("name.en is required");
		if (!ids.has(item.category)) p(`category "${item.category}" isn't in categories.json`);
		for (const lang of ["en", "si", "ta"]) if (!Array.isArray(item.tags?.[lang])) p(`tags.${lang} must be a list`);
		if (kind === "animation" && item.animation?.version !== 1) p("animation.version must be 1");
		if (kind === "template" && (!Array.isArray(item.slots) || item.slots.length === 0)) p("slots must be a non-empty list");
		items.push(item);
	}
	const index = { schema: 1, type: manifest.type, id: manifest.id, version: manifest.version, name: manifest.title, categories, items };
	return { index, problems };
}

export function listTextPacks(packsDir = join(root, "assets", "packs")) {
	const out = [];
	for (const type of TEXT_PACK_TYPES) {
		const typeDir = join(packsDir, type);
		if (!existsSync(typeDir)) continue;
		for (const id of readdirSync(typeDir).sort()) if (isTextPackDir(join(typeDir, id))) out.push({ type, id, dir: join(typeDir, id) });
	}
	return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const write = process.argv.includes("--write");
	let problems = [];
	let count = 0;
	for (const pack of listTextPacks()) {
		const { index, problems: p } = buildTextPackIndex(pack.dir);
		problems = problems.concat(p);
		count += index.items.length;
		if (write) writeFileSync(join(pack.dir, "index.json"), `${JSON.stringify(index, null, "\t")}\n`);
	}
	if (problems.length) {
		console.error(problems.join("\n"));
		process.exit(1);
	}
	console.log(`Text packs are valid (${count} items).`);
}
