import type { TranscriptionModel } from "./types";

/**
 * Models converted to ONNX by .github/workflows/convert-whisper.yml live as
 * GitHub release files ("onnx__encoder_model_q4.onnx"). transformers.js
 * looks for them in its Cache Storage under the Hugging Face URL, so we
 * download each once and file it there; after that the model loads offline.
 */
const CACHE = "transformers-cache";
const HF = "https://huggingface.co/";

/** In the desktop app, downloads go through the main process (no CORS on GitHub's redirects). */
function viaApp(url: string): string {
	return typeof window !== "undefined" && window.worksuite ? `ffnet://get/?u=${encodeURIComponent(url)}` : url;
}

export async function ensureReleaseModel({
	model,
	onProgress,
}: {
	model: TranscriptionModel;
	onProgress?: (progress: number) => void;
}): Promise<void> {
	if (!model.release || typeof caches === "undefined") return;
	const base = `https://github.com/${model.release.repo}/releases/download/${model.release.tag}/`;
	const list = await fetch(viaApp(`${base}files.txt`));
	if (!list.ok) throw new Error(`The ${model.name} model isn't published yet (${list.status}).`);
	const files = (await list.text())
		.split("\n")
		.map((f) => f.trim())
		.filter((f) => f && f !== "files.txt");
	// Only the q4 encoder and merged decoder the engine loads, plus the small config files.
	const wanted = files.filter((f) => !f.endsWith(".onnx") || /^onnx__(encoder_model|decoder_model_merged)_q4\.onnx$/.test(f));
	const cache = await caches.open(CACHE);
	let done = 0;
	for (const file of wanted) {
		const key = `${HF}${model.huggingFaceId}/resolve/main/${file.split("__").join("/")}`;
		if (!(await cache.match(key))) {
			const res = await fetch(viaApp(`${base}${file}`));
			if (!res.ok) throw new Error(`Couldn't download ${file} (${res.status})`);
			const bytes = await res.arrayBuffer();
			await cache.put(key, new Response(bytes, { headers: { "content-length": String(bytes.byteLength), "content-type": res.headers.get("content-type") ?? "application/octet-stream" } }));
		}
		onProgress?.(++done / wanted.length);
	}
}
