/** Image ↔ tensor helpers and tiling for on-device AI (EX-20, EX-21). */

/** RGBA bytes → planar float RGB 0–1 (NCHW without the batch). */
export function rgbaToChw({
	rgba,
	width,
	height,
}: {
	rgba: Uint8ClampedArray | Uint8Array;
	width: number;
	height: number;
}): Float32Array {
	const plane = width * height;
	const out = new Float32Array(plane * 3);
	for (let i = 0; i < plane; i++) {
		out[i] = (rgba[i * 4] ?? 0) / 255;
		out[plane + i] = (rgba[i * 4 + 1] ?? 0) / 255;
		out[plane * 2 + i] = (rgba[i * 4 + 2] ?? 0) / 255;
	}
	return out;
}

/** Planar float RGB → opaque RGBA bytes. */
export function chwToRgba({
	data,
	width,
	height,
}: {
	data: Float32Array;
	width: number;
	height: number;
}): Uint8ClampedArray<ArrayBuffer> {
	const plane = width * height;
	const out = new Uint8ClampedArray(plane * 4);
	for (let i = 0; i < plane; i++) {
		out[i * 4] = Math.round((data[i] ?? 0) * 255);
		out[i * 4 + 1] = Math.round((data[plane + i] ?? 0) * 255);
		out[i * 4 + 2] = Math.round((data[plane * 2 + i] ?? 0) * 255);
		out[i * 4 + 3] = 255;
	}
	return out;
}

export interface Tile {
	/** Region read from the source, including the overlap margin. */
	x: number;
	y: number;
	width: number;
	height: number;
	/** The part of it that is kept (no margin), in source pixels. */
	keepX: number;
	keepY: number;
	keepWidth: number;
	keepHeight: number;
}

/**
 * Splits a frame into tiles with an overlap margin, so each tile fits in
 * GPU memory and the seams are cut from the middle of the overlap.
 */
export function planTiles({
	width,
	height,
	tile,
	overlap,
}: {
	width: number;
	height: number;
	tile: number;
	overlap: number;
}): Tile[] {
	const tiles: Tile[] = [];
	for (let ky = 0; ky < height; ky += tile) {
		for (let kx = 0; kx < width; kx += tile) {
			const keepWidth = Math.min(tile, width - kx);
			const keepHeight = Math.min(tile, height - ky);
			const x = Math.max(0, kx - overlap);
			const y = Math.max(0, ky - overlap);
			const right = Math.min(width, kx + keepWidth + overlap);
			const bottom = Math.min(height, ky + keepHeight + overlap);
			tiles.push({
				x,
				y,
				width: right - x,
				height: bottom - y,
				keepX: kx,
				keepY: ky,
				keepWidth,
				keepHeight,
			});
		}
	}
	return tiles;
}

/** Copies a rectangle out of an RGBA frame. */
export function cropRgba({
	rgba,
	width,
	x,
	y,
	cropWidth,
	cropHeight,
}: {
	rgba: Uint8ClampedArray;
	width: number;
	x: number;
	y: number;
	cropWidth: number;
	cropHeight: number;
}): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(cropWidth * cropHeight * 4);
	for (let row = 0; row < cropHeight; row++) {
		const start = ((y + row) * width + x) * 4;
		out.set(rgba.subarray(start, start + cropWidth * 4), row * cropWidth * 4);
	}
	return out;
}

/** Pads a frame to a multiple of `multiple` by repeating the edge pixels. */
export function padRgba({
	rgba,
	width,
	height,
	multiple,
}: {
	rgba: Uint8ClampedArray<ArrayBuffer>;
	width: number;
	height: number;
	multiple: number;
}): { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
	const w = Math.ceil(width / multiple) * multiple;
	const h = Math.ceil(height / multiple) * multiple;
	if (w === width && h === height) return { rgba, width, height };
	const out = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		const sy = Math.min(y, height - 1);
		for (let x = 0; x < w; x++) {
			const sx = Math.min(x, width - 1);
			const s = (sy * width + sx) * 4;
			const d = (y * w + x) * 4;
			out[d] = rgba[s] ?? 0;
			out[d + 1] = rgba[s + 1] ?? 0;
			out[d + 2] = rgba[s + 2] ?? 0;
			out[d + 3] = rgba[s + 3] ?? 255;
		}
	}
	return { rgba: out, width: w, height: h };
}
