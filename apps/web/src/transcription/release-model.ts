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

/**
 * GET as bytes. XMLHttpRequest, not fetch: in the desktop app the page's
 * fetch refuses the ffnet:// scheme, while XHR reads it fine.
 */
function getBytes({ url, onProgress }: { url: string; onProgress?: (share: number) => void }): Promise<{ status: number; bytes: ArrayBuffer; type: string }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url);
		xhr.responseType = "arraybuffer";
		xhr.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
		xhr.onload = () => {
			const bytes: unknown = xhr.response;
			if (!(bytes instanceof ArrayBuffer)) return reject(new Error("The model download came back empty."));
			resolve({ status: xhr.status, bytes, type: xhr.getResponseHeader("content-type") ?? "application/octet-stream" });
		};
		xhr.onerror = () => reject(new Error("Couldn't reach the model download. Check your connection."));
		xhr.send();
	});
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
	const list = await getBytes({ url: viaApp(`${base}files.txt`) });
	if (list.status !== 200) throw new Error(`The ${model.name} model isn't published yet (${list.status}).`);
	const files = new TextDecoder()
		.decode(list.bytes)
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
			const res = await getBytes({ url: viaApp(`${base}${file}`), onProgress: (share) => onProgress?.((done + share) / wanted.length) });
			if (res.status !== 200) throw new Error(`Couldn't download ${file} (${res.status})`);
			await cache.put(key, new Response(res.bytes, { headers: { "content-length": String(res.bytes.byteLength), "content-type": res.type } }));
		}
		onProgress?.(++done / wanted.length);
	}
}
