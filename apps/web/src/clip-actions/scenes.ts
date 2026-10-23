/**
 * Scene-change detection for "Split scene": colour histograms of sampled
 * frames, cut where consecutive frames differ far more than usual.
 */
const BINS = 4; // per channel → 64-bin RGB histogram

export function histogram(rgba: Uint8ClampedArray): Float32Array {
	const hist = new Float32Array(BINS * BINS * BINS);
	let count = 0;
	for (let i = 0; i < rgba.length; i += 4) {
		const r = (rgba[i] * BINS) >> 8;
		const g = (rgba[i + 1] * BINS) >> 8;
		const b = (rgba[i + 2] * BINS) >> 8;
		hist[r * BINS * BINS + g * BINS + b]++;
		count++;
	}
	if (count > 0) for (let i = 0; i < hist.length; i++) hist[i] /= count;
	return hist;
}

/** 0 (same colours) … 1 (nothing in common). */
export function histogramDistance({
	a,
	b,
}: {
	a: Float32Array;
	b: Float32Array;
}): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - (b[i] ?? 0));
	return sum / 2;
}

/**
 * Times (seconds, from `times`) where a new shot starts: a jump well above
 * both a fixed floor and the clip's typical frame-to-frame change, at
 * least `minGap` seconds after the previous cut.
 */
export function findSceneCuts({
	times,
	histograms,
	threshold = 0.35,
	minGap = 1,
}: {
	times: number[];
	histograms: Float32Array[];
	threshold?: number;
	minGap?: number;
}): number[] {
	const diffs = histograms
		.slice(1)
		.map((h, i) => histogramDistance({ a: histograms[i], b: h }));
	if (diffs.length === 0) return [];
	const sorted = [...diffs].sort((x, y) => x - y);
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
	const cuts: number[] = [];
	diffs.forEach((d, i) => {
		const t = times[i + 1];
		if (t === undefined) return;
		if (d < threshold || d < median * 3) return;
		if (cuts.length > 0 && t - (cuts.at(-1) ?? 0) < minGap) return;
		cuts.push(t);
	});
	return cuts;
}

/** Shifts elements on one track that start at or after `from` by `by`. */
export function shiftTrackElements<TElement extends { startTime: number }>({
	elements,
	from,
	by,
}: {
	elements: TElement[];
	from: number;
	by: number;
}): TElement[] {
	return elements.map((e) =>
		e.startTime >= from ? { ...e, startTime: e.startTime + by } : e,
	);
}
