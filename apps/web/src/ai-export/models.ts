import { create } from "zustand";
import { portalModelUrl } from "@/models/portal";

/**
 * On-device AI models for export (SRS EX-20, EX-21). Nothing ships in the
 * installer: each model downloads once from Settings → Local models, or is
 * imported from a file, and is kept in the app's Cache Storage.
 */
export type AiModelKind = "upscale" | "interpolate";

export interface AiModelInfo {
	id: string;
	kind: AiModelKind;
	name: string;
	licence: string;
	/** Public source, tried when the download center doesn't have it; any compatible .onnx can be imported instead. */
	url: string;
	approxBytes: number;
	about: string;
}

export const AI_MODELS: AiModelInfo[] = [
	{
		id: "realesrgan-x4",
		kind: "upscale",
		name: "Real-ESRGAN x4plus",
		licence: "BSD-3-Clause",
		url: "https://huggingface.co/qualcomm/Real-ESRGAN-x4plus/resolve/main/Real-ESRGAN-x4plus.onnx",
		approxBytes: 67_000_000,
		about:
			"AI Ultra HD: restores detail when exporting above the project size and cleans up noise and compression artefacts.",
	},
	{
		id: "rife",
		kind: "interpolate",
		name: "RIFE (frame interpolation)",
		licence: "MIT",
		url: "https://huggingface.co/onnx-community/rife-v4.6/resolve/main/onnx/model.onnx",
		approxBytes: 21_000_000,
		about:
			"Optical flow: makes in-between frames for smoother motion when the export frame rate is double the project's.",
	},
];

const CACHE = "frameflow-models";
const keyFor = (id: string) => `https://frameflow.local/models/${id}.onnx`;

interface ModelState {
	/** Installed model ids → size in bytes. */
	installed: Record<string, number>;
	/** Download progress 0–1 by model id. */
	progress: Record<string, number>;
	errors: Record<string, string>;
	set: (patch: Partial<Omit<ModelState, "set">>) => void;
}

export const useAiModels = create<ModelState>()((set) => ({
	installed: {},
	progress: {},
	errors: {},
	set: (patch) => set(patch),
}));

const hasCaches = () => typeof caches !== "undefined";

/** Reads which models are on this device. */
export async function refreshInstalledModels(): Promise<void> {
	if (!hasCaches()) return;
	const cache = await caches.open(CACHE);
	const installed: Record<string, number> = {};
	for (const model of AI_MODELS) {
		const hit = await cache.match(keyFor(model.id));
		if (hit) installed[model.id] = Number(hit.headers.get("x-size") ?? 0);
	}
	useAiModels.getState().set({ installed });
}

async function store({ id, bytes }: { id: string; bytes: ArrayBuffer }) {
	const cache = await caches.open(CACHE);
	await cache.put(
		keyFor(id),
		new Response(bytes, { headers: { "x-size": String(bytes.byteLength) } }),
	);
	await refreshInstalledModels();
}

/** Downloads a model with progress; resolves when it's stored. */
export async function downloadModel(id: string): Promise<void> {
	const model = AI_MODELS.find((m) => m.id === id);
	if (!model) throw new Error(`Unknown model ${id}`);
	const state = useAiModels.getState();
	state.set({
		progress: { ...state.progress, [id]: 0 },
		errors: { ...state.errors, [id]: "" },
	});
	try {
		const response = await fetchFirst([portalModelUrl(model.id), model.url]);
		const total = Number(response.headers.get("content-length") ?? model.approxBytes);
		const reader = response.body.getReader();
		const parts: Uint8Array[] = [];
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			parts.push(value);
			received += value.byteLength;
			const now = useAiModels.getState();
			now.set({ progress: { ...now.progress, [id]: Math.min(0.99, received / total) } });
		}
		const bytes = new Uint8Array(received);
		let offset = 0;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.byteLength;
		}
		await store({ id, bytes: bytes.buffer });
	} catch (error) {
		const now = useAiModels.getState();
		now.set({
			errors: {
				...now.errors,
				[id]: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	} finally {
		const now = useAiModels.getState();
		const { [id]: _done, ...rest } = now.progress;
		now.set({ progress: rest });
	}
}

/** Uses a .onnx file the user already has (e.g. from their IT team). */
export async function importModel({ id, file }: { id: string; file: File }) {
	await store({ id, bytes: await file.arrayBuffer() });
}

export async function removeModel(id: string): Promise<void> {
	if (!hasCaches()) return;
	const cache = await caches.open(CACHE);
	await cache.delete(keyFor(id));
	await refreshInstalledModels();
}

export async function readModel(id: string): Promise<ArrayBuffer | null> {
	if (!hasCaches()) return null;
	const cache = await caches.open(CACHE);
	const hit = await cache.match(keyFor(id));
	return hit ? hit.arrayBuffer() : null;
}

export function modelFor(kind: AiModelKind): AiModelInfo {
	const model = AI_MODELS.find((m) => m.kind === kind);
	if (!model) throw new Error(`No ${kind} model`);
	return model;
}

/** The first source that answers; the error names every source's status. */
async function fetchFirst(urls: string[]): Promise<Response & { body: ReadableStream<Uint8Array> }> {
	const failures: string[] = [];
	for (const url of urls) {
		try {
			const response = await fetch(url);
			if (response.ok && response.body)
				return Object.assign(response, { body: response.body });
			failures.push(String(response.status));
		} catch {
			failures.push("offline");
		}
	}
	throw new Error(`Download failed (${failures.join(", ")})`);
}
