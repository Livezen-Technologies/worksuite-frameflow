import { createSession, loadOrt } from "./runtime";
import { downloadModel, modelFor, readModel } from "./models";

/**
 * Remove background (no green screen): a portrait matting model (MODNet:
 * [1,3,H,W] input normalised to −1…1, [1,1,H,W] alpha out) run on the
 * device. Returns the picture as a PNG with the background transparent.
 */
const SIDE = 512;

let cached: Promise<Awaited<ReturnType<typeof createSession>>> | null = null;

async function session(onProgress?: (stage: string) => void) {
	if (!cached) {
		cached = (async () => {
			const model = modelFor("matting");
			let bytes = await readModel(model.id);
			if (!bytes) {
				onProgress?.("Downloading the background model (one time, about 25 MB)…");
				await downloadModel(model.id);
				bytes = await readModel(model.id);
			}
			if (!bytes) throw new Error("Couldn't load the background model");
			return createSession(bytes);
		})().catch((error) => {
			cached = null;
			throw error;
		});
	}
	return cached;
}

export async function removeBackground({ image, onProgress }: { image: Blob; onProgress?: (stage: string) => void }): Promise<Blob> {
	const ort = await loadOrt();
	const { session: s } = await session(onProgress);
	onProgress?.("Removing the background…");
	const bitmap = await createImageBitmap(image);
	const { width, height } = bitmap;
	// The model wants sides that are multiples of 32; the long side is SIDE.
	const k = SIDE / Math.max(width, height);
	const w = Math.max(32, Math.round((width * k) / 32) * 32);
	const h = Math.max(32, Math.round((height * k) / 32) * 32);
	const small = new OffscreenCanvas(w, h);
	const sctx = small.getContext("2d");
	if (!sctx) throw new Error("Couldn't read the picture");
	sctx.drawImage(bitmap, 0, 0, w, h);
	const px = sctx.getImageData(0, 0, w, h).data;
	const input = new Float32Array(3 * w * h);
	for (let i = 0; i < w * h; i++) {
		input[i] = px[i * 4] / 127.5 - 1;
		input[w * h + i] = px[i * 4 + 1] / 127.5 - 1;
		input[2 * w * h + i] = px[i * 4 + 2] / 127.5 - 1;
	}
	const out = await s.run({ [s.inputNames[0] ?? "input"]: new ort.Tensor("float32", input, [1, 3, h, w]) });
	const matte = out[s.outputNames[0] ?? "output"]?.data;
	if (!(matte instanceof Float32Array)) throw new Error("The background model gave no result");
	// Matte at model size → canvas alpha, scaled back up to the full picture.
	const alpha = new OffscreenCanvas(w, h);
	const actx = alpha.getContext("2d");
	if (!actx) throw new Error("Couldn't draw the cut-out");
	const mask = actx.createImageData(w, h);
	for (let i = 0; i < w * h; i++) {
		mask.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, matte[i])) * 255);
	}
	actx.putImageData(mask, 0, 0);
	const full = new OffscreenCanvas(width, height);
	const fctx = full.getContext("2d");
	if (!fctx) throw new Error("Couldn't draw the cut-out");
	fctx.imageSmoothingQuality = "high";
	fctx.drawImage(alpha, 0, 0, width, height);
	fctx.globalCompositeOperation = "source-in";
	fctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return full.convertToBlob({ type: "image/png" });
}
