import type * as Ort from "onnxruntime-web";

/**
 * onnxruntime-web, served from public/vendor/ort (scripts/copy-ort.mjs) and
 * loaded only when AI export is used. WebGPU first, then WebAssembly.
 */
const ORT_URL = "/vendor/ort/ort.webgpu.bundle.min.mjs";

let ortPromise: Promise<typeof Ort> | null = null;

export function loadOrt(): Promise<typeof Ort> {
	if (!ortPromise) {
		ortPromise = (
			// A runtime file from public/ has no types; it is onnxruntime-web's own bundle.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
			import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ORT_URL) as Promise<
				typeof Ort
			>
		).then((ort) => {
			ort.env.wasm.wasmPaths = "/vendor/ort/";
			ort.env.wasm.numThreads =
				typeof crossOriginIsolated !== "undefined" && crossOriginIsolated
					? Math.min(4, navigator.hardwareConcurrency || 1)
					: 1;
			return ort;
		});
	}
	return ortPromise;
}

export type AiBackend = "webgpu" | "wasm";

export async function createSession(
	bytes: ArrayBuffer,
): Promise<{ session: Ort.InferenceSession; backend: AiBackend }> {
	const ort = await loadOrt();
	const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
	if (gpu) {
		try {
			const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
				executionProviders: ["webgpu"],
			});
			return { session, backend: "webgpu" };
		} catch {
			// Falls back to the CPU below.
		}
	}
	const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
		executionProviders: ["wasm"],
	});
	return { session, backend: "wasm" };
}
