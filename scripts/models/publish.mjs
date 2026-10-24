// Mirrors the on-device models (scripts/models/models.json) into a folder laid
// out like the download center's models/ path, ready to upload:
//
//   node scripts/models/publish.mjs --out dist/models
//
//   <out>/<id>.onnx                                  single-file models
//   <out>/hf/<repo>/resolve/main/<file>              Whisper (q4 files + configs)
//   <out>/manifest.json                              what was mirrored, from where
//
// Prints the source each model came from, so a dead public link shows up here.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, "models.json"), "utf8"));
const outIndex = process.argv.indexOf("--out");
const out = outIndex > 0 ? process.argv[outIndex + 1] : "dist/models";
const HF = "https://huggingface.co";

async function fetchOk(url) {
	const response = await fetch(url, { redirect: "follow" });
	return response.ok ? response : null;
}

async function save(url, path) {
	const response = await fetchOk(url);
	if (!response) return null;
	const bytes = Buffer.from(await response.arrayBuffer());
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, bytes);
	return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Public .onnx files on Hugging Face whose repo or file matches `match`. */
async function searchOnnx({ search, match }) {
	const pattern = new RegExp(match, "i");
	const words = search.split(/\s+/).filter((w) => w !== "onnx");
	const found = [];
	for (const term of [search, words.join(" "), words[0]]) {
		const response = await fetchOk(`${HF}/api/models?search=${encodeURIComponent(term)}&limit=40&full=true`);
		if (!response) continue;
		for (const repo of await response.json()) {
			if (repo.private || repo.gated) continue;
			for (const file of repo.siblings ?? []) {
				const name = file.rfilename;
				if (!name.endsWith(".onnx") || !pattern.test(`${repo.id}/${name}`)) continue;
				if (/fp16|int8|quant|q4|uint8/i.test(name)) continue;
				found.push(`${HF}/${repo.id}/resolve/main/${name}`);
			}
		}
		if (found.length) break;
	}
	return found;
}

const manifest = { createdAt: new Date().toISOString(), onnx: {}, whisper: {} };
let failed = false;

for (const model of config.onnx) {
	const candidates = [...model.sources, ...(await searchOnnx(model))];
	let saved = null;
	for (const url of candidates) {
		saved = await save(url, join(out, `${model.id}.onnx`));
		if (saved) {
			manifest.onnx[model.id] = { source: url, ...saved };
			console.log(`${model.id}: ${url} (${(saved.bytes / 1e6).toFixed(1)} MB)`);
			break;
		}
		console.log(`${model.id}: no answer from ${url}`);
	}
	if (!saved) {
		console.error(`::error::${model.id}: no source answered`);
		failed = true;
	}
}

for (const repo of config.whisper) {
	const info = await fetchOk(`${HF}/api/models/${repo}`);
	if (!info) {
		console.error(`::error::${repo}: not found`);
		failed = true;
		continue;
	}
	const files = (await info.json()).siblings
		.map((s) => s.rfilename)
		.filter((name) => (/^[^/]+\.(json|txt)$/.test(name) && !/^README/i.test(name)) || /^onnx\/[^/]+_q4\.onnx(_data)?$/.test(name));
	const entries = {};
	for (const name of files) {
		const saved = await save(`${HF}/${repo}/resolve/main/${name}`, join(out, "hf", repo, "resolve", "main", name));
		if (!saved) {
			console.error(`::error::${repo}/${name}: download failed`);
			failed = true;
			continue;
		}
		entries[name] = saved;
	}
	const total = Object.values(entries).reduce((n, e) => n + e.bytes, 0);
	manifest.whisper[repo] = entries;
	console.log(`${repo}: ${files.length} files, ${(total / 1e6).toFixed(1)} MB`);
}

writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
if (failed) process.exit(1);
