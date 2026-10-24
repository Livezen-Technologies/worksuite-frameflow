// The built-in Text library packs (repo: assets/packs/text-animations and
// assets/packs/text-templates) are served from public/text-packs/<type>/<id>/index.json.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTextPackIndex, listTextPacks } from "../../../scripts/assets/text-packs.mjs";

const out = join(import.meta.dirname, "..", "public", "text-packs");
rmSync(out, { recursive: true, force: true });
const packs = [];
for (const pack of listTextPacks()) {
	const { index, problems } = buildTextPackIndex(pack.dir);
	if (problems.length) {
		console.error(problems.join("\n"));
		process.exit(1);
	}
	mkdirSync(join(out, pack.type, pack.id), { recursive: true });
	writeFileSync(join(out, pack.type, pack.id, "index.json"), JSON.stringify(index));
	packs.push({ type: pack.type, id: pack.id, version: index.version });
}
writeFileSync(join(out, "packs.json"), JSON.stringify({ schema: 1, packs }));
console.log(`copy-text-packs: public/text-packs ready (${packs.length} packs)`);
