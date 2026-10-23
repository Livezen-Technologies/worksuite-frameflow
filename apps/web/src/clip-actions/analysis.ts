/**
 * Frame analysis for Stabilize and Remove flicker. Both work on small
 * greyscale frames sampled through the clip and turn what they find into
 * ordinary keyframes, so the result stays editable.
 */

/** Rec.709 luma of an RGBA buffer, as 0–1 floats. */
export function toLuma(rgba: Uint8ClampedArray): Float32Array {
	const out = new Float32Array(rgba.length / 4);
	for (let i = 0; i < out.length; i++) {
		out[i] =
			(0.2126 * rgba[i * 4] +
				0.7152 * rgba[i * 4 + 1] +
				0.0722 * rgba[i * 4 + 2]) /
			255;
	}
	return out;
}

export function meanOf(values: Float32Array): number {
	let sum = 0;
	for (const v of values) sum += v;
	return values.length ? sum / values.length : 0;
}

/**
 * The shift (pixels) that best moves frame `a` onto frame `b`: block
 * matching of the centre region over ±range pixels, mean absolute error.
 */
export function estimateShift({
	a,
	b,
	width,
	height,
	range = 6,
}: {
	a: Float32Array;
	b: Float32Array;
	width: number;
	height: number;
	range?: number;
}): { dx: number; dy: number } {
	// Compare shapes, not brightness: remove each frame's mean first.
	const ma = meanOf(a);
	const mb = meanOf(b);
	let best = { dx: 0, dy: 0, err: Number.POSITIVE_INFINITY };
	const x0 = range;
	const y0 = range;
	const x1 = width - range;
	const y1 = height - range;
	for (let dy = -range; dy <= range; dy++) {
		for (let dx = -range; dx <= range; dx++) {
			let err = 0;
			let n = 0;
			for (let y = y0; y < y1; y += 2) {
				for (let x = x0; x < x1; x += 2) {
					err += Math.abs(
						(a[y * width + x] ?? 0) - (b[(y + dy) * width + x + dx] ?? 0),
					);
					n++;
				}
			}
			err /= Math.max(1, n);
			// Prefer no motion on ties (flat frames).
			if (
				err < best.err - 1e-6 ||
				(Math.abs(err - best.err) <= 1e-6 &&
					Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy))
			) {
				best = { dx, dy, err };
			}
		}
	}
	return { dx: best.dx, dy: best.dy };
}

/** Centred moving average (window in samples, odd). */
export function smooth({
	values,
	window,
}: {
	values: number[];
	window: number;
}): number[] {
	const half = Math.max(0, Math.floor(window / 2));
	return values.map((_, i) => {
		let sum = 0;
		let n = 0;
		for (
			let j = Math.max(0, i - half);
			j <= Math.min(values.length - 1, i + half);
			j++
		) {
			sum += values[j] ?? 0;
			n++;
		}
		return n ? sum / n : 0;
	});
}

/**
 * Local straight-line fit over the window: follows a steady pan exactly,
 * even at the ends, while averaging out shake.
 */
export function smoothLinear({
	values,
	window,
}: {
	values: number[];
	window: number;
}): number[] {
	const half = Math.max(1, Math.floor(window / 2));
	return values.map((_, i) => {
		const from = Math.max(0, i - half);
		const to = Math.min(values.length - 1, i + half);
		let n = 0;
		let sx = 0;
		let sy = 0;
		let sxx = 0;
		let sxy = 0;
		for (let j = from; j <= to; j++) {
			const v = values[j] ?? 0;
			n++;
			sx += j;
			sy += v;
			sxx += j * j;
			sxy += j * v;
		}
		const denom = n * sxx - sx * sx;
		if (denom === 0) return sy / Math.max(1, n);
		const slope = (n * sxy - sx * sy) / denom;
		return (sy - slope * sx) / n + slope * i;
	});
}

/**
 * Stabilize: from frame-to-frame shifts, the offset (in analysed pixels)
 * to apply at each sample so the camera path follows its smoothed self.
 */
export function stabilizeOffsets({
	shifts,
	window,
	limit = Number.POSITIVE_INFINITY,
}: {
	shifts: { dx: number; dy: number }[];
	window: number;
	/** Largest correction, so the zoomed frame never shows its edge. */
	limit?: number;
}): { x: number; y: number }[] {
	const pathX = [0];
	const pathY = [0];
	for (const s of shifts) {
		pathX.push((pathX.at(-1) ?? 0) + s.dx);
		pathY.push((pathY.at(-1) ?? 0) + s.dy);
	}
	const sx = smoothLinear({ values: pathX, window });
	const sy = smoothLinear({ values: pathY, window });
	const clamp = (v: number) => Math.max(-limit, Math.min(limit, v));
	// Content moved by path; move it back by (path - smoothed).
	return pathX.map((x, i) => ({
		x: clamp((sx[i] ?? 0) - x),
		y: clamp((sy[i] ?? 0) - (pathY[i] ?? 0)),
	}));
}

/** Remove flicker: exposure (stops) per sample that evens out brightness. */
export function flickerCorrection({
	means,
	window,
}: {
	means: number[];
	window: number;
}): number[] {
	const target = smooth({ values: means, window });
	return means.map((m, i) => {
		const t = target[i] ?? m;
		if (m <= 0.002 || t <= 0.002) return 0;
		return Math.max(-1, Math.min(1, Math.log2(t / m)));
	});
}
