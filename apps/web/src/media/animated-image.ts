"use client";

/**
 * Animated GIF and WebP frames for the renderer. An image clip whose file has
 * more than one frame plays them by clip time and loops; still images (and
 * browsers without ImageDecoder) keep the single-picture path.
 */

export interface AnimatedImage {
	frames: Array<{ bitmap: ImageBitmap; start: number }>;
	/** One loop, in seconds. */
	duration: number;
	width: number;
	height: number;
}

const MAX_FRAMES = 900;
const cache = new Map<string, Promise<AnimatedImage | null>>();

const ANIMATED_TYPES = ["image/gif", "image/webp", "image/apng", "image/png"];

/** Loop length in seconds when `file` is animated, otherwise null. */
export async function animatedImageDuration(file: Blob): Promise<number | null> {
	const decoded = await decodeAnimated({ blob: file });
	if (!decoded) return null;
	const duration = decoded.duration;
	for (const frame of decoded.frames) frame.bitmap.close();
	return duration;
}

async function decodeAnimated({
	blob,
	maxSourceSize,
}: {
	blob: Blob;
	maxSourceSize?: number;
}): Promise<AnimatedImage | null> {
	const Decoder = (globalThis as { ImageDecoder?: typeof ImageDecoder }).ImageDecoder;
	const type = blob.type || "image/gif";
	if (!Decoder || !ANIMATED_TYPES.includes(type)) return null;
	if (!(await Decoder.isTypeSupported(type))) return null;
	const decoder = new Decoder({ data: blob.stream(), type });
	try {
		await decoder.tracks.ready;
		const track = decoder.tracks.selectedTrack;
		if (!track || !track.animated || track.frameCount < 2) return null;
		await decoder.completed;
		const count = Math.min(MAX_FRAMES, track.frameCount);
		const frames: AnimatedImage["frames"] = [];
		let time = 0;
		let width = 0;
		let height = 0;
		for (let index = 0; index < count; index++) {
			const { image } = await decoder.decode({ frameIndex: index });
			width = image.displayWidth;
			height = image.displayHeight;
			const scale = maxSourceSize ? Math.min(1, maxSourceSize / Math.max(width, height)) : 1;
			const bitmap = await createImageBitmap(image, {
				resizeWidth: Math.max(1, Math.round(width * scale)),
				resizeHeight: Math.max(1, Math.round(height * scale)),
			});
			// GIFs often store 0 or 10 ms delays; browsers show those at 100 ms.
			const micros = image.duration ?? 0;
			const seconds = micros < 20_000 ? 0.1 : micros / 1e6;
			image.close();
			frames.push({ bitmap, start: time });
			time += seconds;
			width = bitmap.width;
			height = bitmap.height;
		}
		return { frames, duration: time, width, height };
	} catch {
		return null;
	} finally {
		decoder.close();
	}
}

/** Decoded frames for the image at `url`, or null for a still image. */
export function loadAnimatedImage({
	url,
	maxSourceSize,
}: {
	url: string;
	maxSourceSize?: number;
}): Promise<AnimatedImage | null> {
	const key = `${url}::${maxSourceSize ?? "full"}`;
	let hit = cache.get(key);
	if (!hit) {
		hit = fetch(url)
			.then((response) => response.blob())
			.then((blob) => decodeAnimated({ blob, maxSourceSize }))
			.catch(() => null);
		cache.set(key, hit);
	}
	return hit;
}

/** The frame shown `seconds` into the clip (looping). */
export function animatedFrameAt({ image, seconds }: { image: AnimatedImage; seconds: number }) {
	const t = ((seconds % image.duration) + image.duration) % image.duration;
	let low = 0;
	let high = image.frames.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (image.frames[mid].start <= t) low = mid;
		else high = mid - 1;
	}
	return image.frames[low].bitmap;
}
