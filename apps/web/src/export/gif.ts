/** GIF tab options (SRS EX-25). */
export interface GifOptions {
	/** Colours per frame, 2–256. */
	colors: number;
	/** Floyd–Steinberg dithering: smoother gradients, larger files. */
	dither: boolean;
	/** "forever", play once, or this many plays. */
	loop: "forever" | "once" | number;
	/** Stop after this many seconds (GIFs get big fast). */
	maxSeconds?: number;
	/** Start this far into the video, e.g. at the playhead or a selection (EX-02). */
	startSeconds?: number;
}

export const DEFAULT_GIF_OPTIONS: GifOptions = {
	colors: 256,
	dither: false,
	loop: "forever",
	maxSeconds: 15,
};

/** gifenc's repeat field: -1 once, 0 forever, n extra plays. */
export function gifRepeat(loop: GifOptions["loop"]): number {
	if (loop === "forever") return 0;
	if (loop === "once") return -1;
	return Math.max(0, Math.round(loop) - 1);
}

function nearest({
	palette,
	r,
	g,
	b,
}: {
	palette: number[][];
	r: number;
	g: number;
	b: number;
}): number {
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < palette.length; i++) {
		const p = palette[i];
		if (!p) continue;
		const dr = r - (p[0] ?? 0);
		const dg = g - (p[1] ?? 0);
		const db = b - (p[2] ?? 0);
		const d = dr * dr + dg * dg + db * db;
		if (d < bestDistance) {
			bestDistance = d;
			best = i;
		}
	}
	return best;
}

/** Maps a frame to palette indexes with Floyd–Steinberg error diffusion. */
export function ditherToPalette({
	rgba,
	width,
	height,
	palette,
}: {
	rgba: Uint8ClampedArray | Uint8Array;
	width: number;
	height: number;
	palette: number[][];
}): Uint8Array {
	const work = new Float32Array(width * height * 3);
	for (let i = 0, j = 0; i < width * height; i++, j += 4) {
		work[i * 3] = rgba[j] ?? 0;
		work[i * 3 + 1] = rgba[j + 1] ?? 0;
		work[i * 3 + 2] = rgba[j + 2] ?? 0;
	}
	const out = new Uint8Array(width * height);
	const spread = ({ x, y, e, f }: { x: number; y: number; e: number[]; f: number }) => {
		if (x < 0 || x >= width || y >= height) return;
		const k = (y * width + x) * 3;
		work[k] = (work[k] ?? 0) + (e[0] ?? 0) * f;
		work[k + 1] = (work[k + 1] ?? 0) + (e[1] ?? 0) * f;
		work[k + 2] = (work[k + 2] ?? 0) + (e[2] ?? 0) * f;
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const k = (y * width + x) * 3;
			const r = Math.min(255, Math.max(0, work[k] ?? 0));
			const g = Math.min(255, Math.max(0, work[k + 1] ?? 0));
			const b = Math.min(255, Math.max(0, work[k + 2] ?? 0));
			const index = nearest({ palette, r, g, b });
			out[y * width + x] = index;
			const p = palette[index] ?? [0, 0, 0];
			const e = [r - (p[0] ?? 0), g - (p[1] ?? 0), b - (p[2] ?? 0)];
			spread({ x: x + 1, y, e, f: 7 / 16 });
			spread({ x: x - 1, y: y + 1, e, f: 3 / 16 });
			spread({ x, y: y + 1, e, f: 5 / 16 });
			spread({ x: x + 1, y: y + 1, e, f: 1 / 16 });
		}
	}
	return out;
}

/** Rough GIF size: LZW on indexed pixels, fewer colours compress better. */
export function estimateGifBytes({
	width,
	height,
	fps,
	seconds,
	options,
}: {
	width: number;
	height: number;
	fps: number;
	seconds: number;
	options: GifOptions;
}): number {
	const length = options.maxSeconds
		? Math.min(seconds, options.maxSeconds)
		: seconds;
	const bitsPerPixel = Math.log2(Math.max(2, options.colors)) / 8;
	const ratio = 0.35 * bitsPerPixel * (options.dither ? 1.4 : 1);
	return width * height * fps * length * ratio + 768;
}
