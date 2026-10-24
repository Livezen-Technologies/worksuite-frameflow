/**
 * Where on-device models download from: the Worksuite download center first
 * (scripts/models/publish.mjs mirrors every model there), then the public
 * source if the download center doesn't have it.
 */
export const MODELS_BASE = (
	process.env.NEXT_PUBLIC_WSC_MODELS_URL ?? "https://download.worksuitecloud.com/models"
).replace(/\/$/, "");

/** Whisper files, laid out like Hugging Face ({model}/resolve/{revision}/{file}). */
export const WHISPER_HOSTS = [`${MODELS_BASE}/hf/`, "https://huggingface.co/"];

/** Download-center URL of a single-file model. */
export function portalModelUrl(id: string): string {
	return `${MODELS_BASE}/${id}.onnx`;
}
