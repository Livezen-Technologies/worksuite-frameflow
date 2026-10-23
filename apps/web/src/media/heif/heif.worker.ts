/// <reference lib="webworker" />
import type factory from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import { primaryColor, readHeifMeta } from "./boxes";
import { p3ToSrgb } from "./color";

/**
 * Decodes HEIC/HEIF (SRS HE-01 – HE-03, HE-05) off the main thread with
 * libheif, which applies tiles (grid), rotation, mirror and crop. Returns
 * the primary image re-encoded as JPEG, or PNG when it has transparency.
 */

export type HeifRequest = {
	id: number;
	buffer: ArrayBuffer;
	/** Decode every picture, not just the primary (HE-05). */
	all?: boolean;
};

export interface DecodedPicture {
	blob: Blob;
	width: number;
	height: number;
}
export type HeifResponse =
	| {
			id: number;
			ok: true;
			blob: Blob;
			width: number;
			height: number;
			imageCount: number;
			/** Every picture when `all` was asked for, primary first. */
			pictures: DecodedPicture[];
			/** The colours were converted from Display P3 (HE-03). */
			convertedFromP3: boolean;
	  }
	| { id: number; ok: false; error: string };

let library: ReturnType<typeof factory> | null = null;

/**
 * libheif is LGPL-3.0, so it's loaded at run time from its own file
 * (copied by scripts/copy-libheif.mjs) rather than bundled: replacing
 * public/vendor/libheif/libheif-bundle.mjs swaps the library (D-8).
 */
const LIBHEIF_URL = "/vendor/libheif/libheif-bundle.mjs";

async function load() {
	if (!library) {
		const loaded: { default: typeof factory } = await import(
			/* webpackIgnore: true */ /* turbopackIgnore: true */ LIBHEIF_URL
		);
		library = loaded.default();
		await library.ready;
	}
	return library;
}

function hasTransparency(data: Uint8ClampedArray): boolean {
	for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
	return false;
}

async function encode({
	image,
	p3,
}: {
	image: { get_width(): number; get_height(): number; display: (t: ImageData, cb: (r: ImageData | null) => void) => void };
	p3: boolean;
}): Promise<DecodedPicture> {
	const width = image.get_width();
	const height = image.get_height();
	const pixels = new ImageData(width, height);
	await new Promise<void>((resolve, reject) =>
		image.display(pixels, (result) =>
			result ? resolve() : reject(new Error("The picture data is damaged.")),
		),
	);
	// The editor works in sRGB: bring wide-gamut colours in (HE-03).
	if (p3) p3ToSrgb(pixels.data);
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas in the decoder worker.");
	ctx.putImageData(pixels, 0, 0);
	const blob = await canvas.convertToBlob(
		hasTransparency(pixels.data) ? { type: "image/png" } : { type: "image/jpeg", quality: 0.95 },
	);
	return { blob, width, height };
}

self.onmessage = async (event: MessageEvent<HeifRequest>) => {
	const { id, buffer, all } = event.data;
	const reply = (message: HeifResponse) => self.postMessage(message);
	try {
		const bytes = new Uint8Array(buffer);
		let p3 = false;
		try {
			const meta = readHeifMeta(bytes);
			p3 = !!meta && primaryColor(meta) === "display-p3";
		} catch {
			// Unreadable boxes: decode as sRGB, like before.
		}
		const libheif = await load();
		const images = new libheif.HeifDecoder().decode(bytes);
		if (!images.length) throw new Error("This file has no picture libheif can read.");
		// libheif lists the primary picture first (is_primary() is broken in this build).
		const pictures: DecodedPicture[] = [];
		for (const image of all ? images : images.slice(0, 1))
			pictures.push(await encode({ image, p3 }));
		for (const i of images) i.free?.();
		const [first] = pictures;
		reply({
			id,
			ok: true,
			blob: first.blob,
			width: first.width,
			height: first.height,
			imageCount: images.length,
			pictures,
			convertedFromP3: p3,
		});
	} catch (error) {
		reply({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
	}
};
