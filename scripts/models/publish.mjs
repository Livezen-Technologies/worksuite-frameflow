// Mirrors the on-device models (scripts/models/models.json) into a folder laid
// out like the download center's models/ path, ready to upload:
//
//   node scripts/models/publish.mjs --out dist/models
//
//   <out>/<id>.onnx                                  single-file models
//   <out>/hf/<repo>/resolve/main/<file>              Whisper (q4 files + configs)
//   <out>/manifest.json                              what was mirrored, from where
//
// Single-file models are checked (size, image inputs; needs python3 with the
// `onnx` package) so a wrong file is skipped. Prints where each model came
// from, so the app's fallback links can be kept in step.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** Input names and shapes of an .onnx file. */
function onnxInputs(path) {
	const script = `import json,sys,onnx
m=onnx.load(sys.argv[1],load_external_data=False)
init={i.name for i in m.graph.initializer}
print(json.dumps([{"name":i.name,"shape":[d.dim_value or d.dim_param for d in i.type.tensor_type.shape.dim]} for i in m.graph.input if i.name not in init]))`;
	return JSON.parse(execFileSync("python3", ["-c", script, path], { encoding: "utf8" }));
}

function acceptable({ path, saved, expect }) {
	if (saved.bytes < expect.minBytes) return `too small (${saved.bytes} bytes)`;
	const inputs = onnxInputs(path);
	const images = inputs.filter((i) => i.shape.length === 4 && i.shape[1] === 3);
	if (images.length !== expect.imageInputs)
		return `inputs ${JSON.stringify(inputs)} (want ${expect.imageInputs} [N,3,H,W])`;
	return null;
}

/** Public .onnx files on Hugging Face whose repo or file matches `match`. */
async function searchOnnx({ search, match }) {
	const pattern = new RegExp(match, "i");
	const found = [];
	for (const term of search) {
		const response = await fetchOk(`${HF}/api/models?search=${encodeURIComponent(term)}&limit=50&full=true`);
		if (!response) continue;
		for (const repo of await response.json()) {
			if (repo.private || repo.gated) continue;
			for (const file of repo.siblings ?? []) {
				const name = file.rfilename;
				if (!name.endsWith(".onnx") || !pattern.test(`${repo.id}/${name}`)) continue;
				if (/fp16|int8|quant|q4|uint8/i.test(name)) continue;
				const url = `${HF}/${repo.id}/resolve/main/${name}`;
				if (!found.includes(url)) found.push(url);
			}
		}
	}
	return found;
}

const manifest = { createdAt: new Date().toISOString(), onnx: {}, whisper: {} };
let failed = false;

for (const model of config.onnx) {
	const candidates = [...model.sources, ...(await searchOnnx(model))];
	const path = join(out, `${model.id}.onnx`);
	let accepted = false;
	for (const url of candidates.slice(0, 25)) {
		const saved = await save(url, path);
		if (!saved) {
			console.log(`${model.id}: no answer from ${url}`);
			continue;
		}
		let problem;
		try {
			problem = acceptable({ path, saved, expect: model.expect });
		} catch (error) {
			problem = `unreadable (${String(error).slice(0, 120)})`;
		}
		if (problem) {
			console.log(`${model.id}: skipped ${url}: ${problem}`);
			rmSync(path, { force: true });
			continue;
		}
		manifest.onnx[model.id] = { source: url, inputs: onnxInputs(path), ...saved };
		console.log(`${model.id}: USING ${url} (${(saved.bytes / 1e6).toFixed(1)} MB) inputs ${JSON.stringify(manifest.onnx[model.id].inputs)}`);
		accepted = true;
		break;
	}
	if (!accepted) {
		console.error(`::error::${model.id}: no usable source`);
		failed = true;
	}
}

// What transformers.js loads for dtype "q4": configs plus these two files.
const WHISPER_FILE = /^[^/]+\.(json|txt)$|^onnx\/(encoder_model|decoder_model_merged)_q4\.onnx(_data)?$/;

for (const repos of config.whisper) {
	let done = false;
	for (const repo of repos) {
		const info = await fetchOk(`${HF}/api/models/${repo}`);
		if (!info) {
			console.log(`${repo}: not found`);
			continue;
		}
		const files = (await info.json()).siblings
			.map((s) => s.rfilename)
			.filter((name) => WHISPER_FILE.test(name) && !/^README/i.test(name));
		if (!files.some((f) => f.startsWith("onnx/encoder_model_q4"))) {
			console.log(`${repo}: no q4 files`);
			continue;
		}
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
		console.log(`${repos[0]}: USING ${repo}, ${files.length} files, ${(total / 1e6).toFixed(1)} MB`);
		done = true;
		break;
	}
	if (!done) {
		console.error(`::error::${repos[0]}: no repo with q4 files`);
		failed = true;
	}
}

writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
if (failed) process.exit(1);
