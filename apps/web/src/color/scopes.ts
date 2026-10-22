/**
 * Video scopes (SRS WS-10) computed from a downscaled RGBA frame.
 * Rec.709 luma, 8-bit levels.
 */
export type ScopeKind = "waveform" | "parade" | "histogram" | "vectorscope";

export const SCOPE_KINDS: { kind: ScopeKind; label: string }[] = [
	{ kind: "waveform", label: "Waveform" },
	{ kind: "parade", label: "Parade" },
	{ kind: "histogram", label: "Histogram" },
	{ kind: "vectorscope", label: "Vectorscope" },
];

export interface Frame {
	width: number;
	height: number;
	/** RGBA, 4 bytes per pixel, row by row. */
	data: Uint8ClampedArray;
}

export function luma({ r, g, b }: { r: number; g: number; b: number }): number {
	return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** Counts per (column, level): out[x * 256 + level]. */
export function waveform({
	frame,
	channel = "luma",
}: {
	frame: Frame;
	channel?: "luma" | 0 | 1 | 2;
}): Uint32Array {
	const out = new Uint32Array(frame.width * 256);
	const { width, height, data } = frame;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (data[i + 3] === 0) continue;
			const level =
				channel === "luma"
					? luma({ r: data[i], g: data[i + 1], b: data[i + 2] })
					: data[i + channel];
			out[x * 256 + level]++;
		}
	}
	return out;
}

export function histogram(frame: Frame): {
	r: Uint32Array;
	g: Uint32Array;
	b: Uint32Array;
	l: Uint32Array;
} {
	const r = new Uint32Array(256);
	const g = new Uint32Array(256);
	const b = new Uint32Array(256);
	const l = new Uint32Array(256);
	const { data } = frame;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue;
		r[data[i]]++;
		g[data[i + 1]]++;
		b[data[i + 2]]++;
		l[luma({ r: data[i], g: data[i + 1], b: data[i + 2] })]++;
	}
	return { r, g, b, l };
}

/**
 * Chroma of each pixel as Cb/Cr (BT.709), each −0.5…0.5, in a size×size
 * grid of counts. Grey sits at the centre.
 */
export function vectorscope({
	frame,
	size = 128,
}: {
	frame: Frame;
	size?: number;
}): Uint32Array {
	const out = new Uint32Array(size * size);
	const { data } = frame;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue;
		const r = data[i] / 255;
		const g = data[i + 1] / 255;
		const b = data[i + 2] / 255;
		const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		const cb = (b - y) / 1.8556;
		const cr = (r - y) / 1.5748;
		const px = Math.min(
			size - 1,
			Math.max(0, Math.round((cb + 0.5) * (size - 1))),
		);
		const py = Math.min(
			size - 1,
			Math.max(0, Math.round((0.5 - cr) * (size - 1))),
		);
		out[py * size + px]++;
	}
	return out;
}

/** The skin-tone line on a vectorscope: about 123° (I-line), as a unit vector in Cb/Cr. */
export const SKIN_TONE_ANGLE_DEGREES = 123;
