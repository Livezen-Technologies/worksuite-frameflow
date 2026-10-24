"use client";

import { loadAnimatedImage } from "@/media/animated-image";

export interface FrameUrls {
	urls: string[];
	starts: number[];
	duration: number;
	width: number;
	height: number;
}

const cache = new Map<string, Promise<FrameUrls | null>>();

export const isAnimatedSrc = (src: string) => /^data:image\/(gif|webp)/.test(src);

/** Each frame of an animated GIF/WebP as a PNG object URL (once per picture), for SVG previews and Lottie export. */
export function animatedFrameUrls(src: string): Promise<FrameUrls | null> {
	let hit = cache.get(src);
	if (!hit) {
		hit = (async () => {
			const image = await loadAnimatedImage({ url: src });
			if (!image) return null;
			const canvas = document.createElement("canvas");
			canvas.width = image.width;
			canvas.height = image.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			const urls: string[] = [];
			for (const frame of image.frames) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(frame.bitmap, 0, 0);
				const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
				urls.push(blob ? URL.createObjectURL(blob) : "");
			}
			return { urls, starts: image.frames.map((f) => f.start), duration: image.duration, width: image.width, height: image.height };
		})().catch(() => null);
		cache.set(src, hit);
	}
	return hit;
}

export function frameIndexAt({ frames, seconds }: { frames: FrameUrls; seconds: number }): number {
	const t = ((seconds % frames.duration) + frames.duration) % frames.duration;
	let i = 0;
	while (i + 1 < frames.starts.length && (frames.starts[i + 1] ?? Infinity) <= t) i++;
	return i;
}
