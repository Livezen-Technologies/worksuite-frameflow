/// <reference lib="webworker" />
import factory from "libheif-js/libheif-wasm/libheif-bundle.mjs";

/**
 * Decodes HEIC/HEIF (SRS HE-01 – HE-03, HE-05) off the main thread with
 * libheif, which applies tiles (grid), rotation, mirror and crop. Returns
 * the primary image re-encoded as JPEG, or PNG when it has transparency.
 */

export type HeifRequest = { id: number; buffer: ArrayBuffer };
export type HeifResponse =
	| {
			id: number;
			ok: true;
			blob: Blob;
			width: number;
			height: number;
			imageCount: number;
	  }
	| { id: number; ok: false; error: string };

let library: ReturnType<typeof factory> | null = null;

async function load() {
	if (!library) {
		library = factory();
		await library.ready;
	}
	return library;
}

function hasTransparency(data: Uint8ClampedArray): boolean {
	for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
	return false;
}

self.onmessage = async (event: MessageEvent<HeifRequest>) => {
	const { id, buffer } = event.data;
	const reply = (message: HeifResponse) => self.postMessage(message);
	try {
		const libheif = await load();
		const images = new libheif.HeifDecoder().decode(new Uint8Array(buffer));
		if (!images.length) throw new Error("This file has no picture libheif can read.");
		// libheif lists the primary picture first (is_primary() is broken in this build).
		const image = images[0];
		const width = image.get_width();
		const height = image.get_height();
		const pixels = new ImageData(width, height);
		await new Promise<void>((resolve, reject) =>
			image.display(pixels, (result) =>
				result ? resolve() : reject(new Error("The picture data is damaged.")),
			),
		);
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("No canvas in the decoder worker.");
		ctx.putImageData(pixels, 0, 0);
		const alpha = hasTransparency(pixels.data);
		const blob = await canvas.convertToBlob(
			alpha ? { type: "image/png" } : { type: "image/jpeg", quality: 0.95 },
		);
		for (const i of images) i.free?.();
		reply({ id, ok: true, blob, width, height, imageCount: images.length });
	} catch (error) {
		reply({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
	}
};
