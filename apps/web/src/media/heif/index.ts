import type { HeifRequest, HeifResponse } from "./heif.worker";
import { type PhotoInfo, readHeifExif } from "./exif";

export type { PhotoInfo } from "./exif";

const HEIF_EXTENSION = /\.(heic|heif|hif)$/i;

export function isHeif({ file }: { file: File }): boolean {
	return HEIF_EXTENSION.test(file.name) || /^image\/hei[cf]/i.test(file.type);
}

/** Accept list for file pickers: browsers don't always map .heic to image/*. */
export const HEIF_ACCEPT = ".heic,.heif,.hif,.avif";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (response: HeifResponse) => void>();

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL("./heif.worker.ts", import.meta.url), { type: "module" });
		worker.onmessage = (event: MessageEvent<HeifResponse>) => {
			pending.get(event.data.id)?.(event.data);
			pending.delete(event.data.id);
		};
	}
	return worker;
}

export interface ConvertedHeif {
	file: File;
	width: number;
	height: number;
	imageCount: number;
	/** Every picture as its own file when `all` was asked for (HE-05). */
	files: File[];
	photo: PhotoInfo | null;
	convertedFromP3: boolean;
}

/**
 * Turns a HEIC/HEIF photo into a JPEG (or PNG with transparency) the editor
 * can use, decoding in a worker so large photos don't freeze the app.
 */
export async function convertHeif({
	file,
	all = false,
}: {
	file: File;
	all?: boolean;
}): Promise<ConvertedHeif> {
	const buffer = await file.arrayBuffer();
	let photo: PhotoInfo | null = null;
	try {
		photo = readHeifExif(new Uint8Array(buffer));
	} catch {
		// EXIF is a bonus; a damaged block shouldn't stop the import.
	}
	const id = nextId++;
	const response = await new Promise<HeifResponse>((resolve) => {
		pending.set(id, resolve);
		const request: HeifRequest = { id, buffer, all };
		getWorker().postMessage(request, [buffer]);
	});
	if (!response.ok) throw new Error(response.error);
	const toFile = ({ blob, index }: { blob: Blob; index: number }) => {
		const extension = blob.type === "image/png" ? "png" : "jpg";
		const suffix = response.pictures.length > 1 ? ` ${index + 1}` : "";
		const name = file.name.replace(HEIF_EXTENSION, `${suffix}.${extension}`);
		return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
	};
	const files = response.pictures.map(({ blob }, index) => toFile({ blob, index }));
	return {
		file: files[0],
		width: response.width,
		height: response.height,
		imageCount: response.imageCount,
		files,
		photo,
		convertedFromP3: response.convertedFromP3,
	};
}

/** Pairs each Live Photo still with the .mov of the same name (HE-06). */
export function findLivePhotoPairs({ files }: { files: File[] }): Map<File, File> {
	const movies = new Map<string, File>();
	for (const file of files)
		if (/\.mov$/i.test(file.name)) movies.set(file.name.replace(/\.mov$/i, "").toLowerCase(), file);
	const pairs = new Map<File, File>();
	for (const file of files) {
		if (!isHeif({ file })) continue;
		const movie = movies.get(file.name.replace(HEIF_EXTENSION, "").toLowerCase());
		if (movie) pairs.set(file, movie);
	}
	return pairs;
}
