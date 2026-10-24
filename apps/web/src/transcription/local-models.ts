import { create } from "zustand";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_MODEL, TRANSCRIPTION_MODELS } from "./models";
import type { TranscriptionModelId } from "./types";

/**
 * Whisper speech models on this device (Settings → Local models). They're
 * cached by transformers.js in Cache Storage the first time they load, from
 * the download center or Hugging Face (see models/portal.ts).
 */
const CACHE = "transformers-cache";

/** Rough q4 download sizes, for the list before a model is on the device. */
export const WHISPER_APPROX_BYTES: Record<TranscriptionModelId, number> = {
	"whisper-tiny": 100_000_000,
	"whisper-small": 304_000_000,
	"whisper-medium": 685_000_000,
	"whisper-large-v3-turbo": 764_000_000,
};

export const WHISPER_DEFAULT = DEFAULT_TRANSCRIPTION_MODEL;

interface WhisperState {
	/** Installed model ids → bytes on the device. */
	installed: Partial<Record<TranscriptionModelId, number>>;
	/** Download progress 0–1 by model id. */
	progress: Partial<Record<TranscriptionModelId, number>>;
	errors: Partial<Record<TranscriptionModelId, string>>;
	set: (patch: Partial<Omit<WhisperState, "set">>) => void;
}

export const useWhisperModels = create<WhisperState>()((set) => ({
	installed: {},
	progress: {},
	errors: {},
	set: (patch) => set(patch),
}));

/** Cached files of one model: any host, `<repo>/resolve/<revision>/...`. */
async function modelEntries(id: TranscriptionModelId): Promise<{ cache: Cache; keys: Request[] } | null> {
	if (typeof caches === "undefined") return null;
	const model = TRANSCRIPTION_MODELS.find((m) => m.id === id);
	if (!model) return null;
	const cache = await caches.open(CACHE);
	const keys = (await cache.keys()).filter((key) => key.url.includes(`/${model.huggingFaceId}/resolve/`));
	return { cache, keys };
}

export async function refreshWhisperModels(): Promise<void> {
	const installed: WhisperState["installed"] = {};
	for (const model of TRANSCRIPTION_MODELS) {
		const entries = await modelEntries(model.id);
		if (!entries || !entries.keys.some((key) => key.url.endsWith(".onnx"))) continue;
		let bytes = 0;
		for (const key of entries.keys) {
			const hit = await entries.cache.match(key);
			bytes += Number(hit?.headers.get("content-length") ?? 0);
		}
		installed[model.id] = bytes;
	}
	useWhisperModels.getState().set({ installed });
}

export async function downloadWhisperModel(id: TranscriptionModelId): Promise<void> {
	const state = useWhisperModels.getState();
	state.set({ progress: { ...state.progress, [id]: 0 }, errors: { ...state.errors, [id]: "" } });
	try {
		await transcriptionService.preload({
			modelId: id,
			onProgress: (p) => {
				const now = useWhisperModels.getState();
				now.set({ progress: { ...now.progress, [id]: Math.min(0.99, p.progress / 100) } });
			},
		});
		await refreshWhisperModels();
	} catch (error) {
		const now = useWhisperModels.getState();
		now.set({ errors: { ...now.errors, [id]: error instanceof Error ? error.message : String(error) } });
		throw error;
	} finally {
		const now = useWhisperModels.getState();
		const { [id]: _done, ...rest } = now.progress;
		now.set({ progress: rest });
	}
}

export async function removeWhisperModel(id: TranscriptionModelId): Promise<void> {
	const entries = await modelEntries(id);
	if (!entries) return;
	transcriptionService.terminate();
	await Promise.all(entries.keys.map((key) => entries.cache.delete(key)));
	await refreshWhisperModels();
}
