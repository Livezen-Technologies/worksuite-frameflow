/**
 * Speed curves: non-destructive time remapping for one clip (no splitting).
 *
 * A curve is a list of keyframes over the clip's source, each at `at`
 * (0 = first source frame shown, 1 = last) with a speed multiplier. Between
 * keyframes speed is interpolated in source position. Clip time is the
 * integral of 1 / speed over source, so faster sections take less time.
 *
 * Everything here is unit-free: callers pass the clip duration in the same
 * unit as the clip time (ticks or seconds), and the source span follows.
 * `retime.rate` is kept equal to the curve's average speed, so code that
 * only needs "source span = rate × duration" stays right.
 */

export type SpeedInterpolation = "smooth" | "linear" | "hold";

export interface SpeedKeyframe {
	id: string;
	/** Position along the clip's source, 0–1. */
	at: number;
	/** Speed multiplier from MIN_CURVE_SPEED to MAX_CURVE_SPEED. */
	speed: number;
	/** How speed moves from this keyframe to the next. */
	interpolation: SpeedInterpolation;
	/** Smooth only: 0 = straight ramp, 1 = full ease in and out (default 1). */
	ease?: number;
}

export const MIN_CURVE_SPEED = 0.1;
export const MAX_CURVE_SPEED = 10;
const TABLE_SIZE = 1024;

export function clampCurveSpeed(speed: number): number {
	if (!Number.isFinite(speed) || speed <= 0) return 1;
	return Math.min(MAX_CURVE_SPEED, Math.max(MIN_CURVE_SPEED, speed));
}

/** Keyframes sorted, clamped, at least one; ends are held flat. */
export function normalizeCurve(keyframes: SpeedKeyframe[]): SpeedKeyframe[] {
	const sorted = keyframes
		.map((k) => ({ ...k, at: Math.min(1, Math.max(0, k.at)), speed: clampCurveSpeed(k.speed) }))
		.sort((a, b) => a.at - b.at);
	return sorted.length ? sorted : [{ id: "k0", at: 0, speed: 1, interpolation: "smooth" }];
}

/** Speed at source position p ∈ [0, 1]. */
export function speedAt({ keyframes, p }: { keyframes: SpeedKeyframe[]; p: number }): number {
	const keys = keyframes;
	if (!keys.length) return 1;
	const first = keys[0];
	const last = keys[keys.length - 1];
	if (p <= first.at) return first.speed;
	if (p >= last.at) return last.speed;
	let i = 0;
	while (i < keys.length - 2 && keys[i + 1].at < p) i++;
	const a = keys[i];
	const b = keys[i + 1];
	const span = b.at - a.at;
	if (span <= 0) return b.speed;
	const t = (p - a.at) / span;
	switch (a.interpolation) {
		case "hold":
			return a.speed;
		case "linear":
			return a.speed + (b.speed - a.speed) * t;
		case "smooth": {
			const e = Math.min(1, Math.max(0, a.ease ?? 1));
			const s = t * t * (3 - 2 * t);
			return a.speed + (b.speed - a.speed) * (t + (s - t) * e);
		}
	}
}

interface Table {
	/** Cumulative ∫ 1/speed dp at TABLE_SIZE + 1 even steps of p. */
	cumulative: Float64Array;
	/** ∫₀¹ 1/speed dp: clip duration per unit of source. */
	total: number;
}

const tables = new WeakMap<SpeedKeyframe[], Table>();

function tableFor(keyframes: SpeedKeyframe[]): Table {
	const cached = tables.get(keyframes);
	if (cached) return cached;
	const keys = normalizeCurve(keyframes);
	const cumulative = new Float64Array(TABLE_SIZE + 1);
	let previous = 1 / speedAt({ keyframes: keys, p: 0 });
	for (let i = 1; i <= TABLE_SIZE; i++) {
		const inv = 1 / speedAt({ keyframes: keys, p: i / TABLE_SIZE });
		cumulative[i] = cumulative[i - 1] + ((previous + inv) / 2) / TABLE_SIZE;
		previous = inv;
	}
	const table = { cumulative, total: cumulative[TABLE_SIZE] };
	tables.set(keyframes, table);
	return table;
}

/** The curve's average speed (source span ÷ clip duration). */
export function averageCurveSpeed(keyframes: SpeedKeyframe[]): number {
	return 1 / tableFor(keyframes).total;
}

/** Fraction of clip time elapsed when source position p is shown. */
function clipFractionAt({ table, p }: { table: Table; p: number }): number {
	const x = Math.min(1, Math.max(0, p)) * TABLE_SIZE;
	const i = Math.min(TABLE_SIZE - 1, Math.floor(x));
	const f = x - i;
	const value = table.cumulative[i] + (table.cumulative[i + 1] - table.cumulative[i]) * f;
	return value / table.total;
}

/** Source position shown at clip-time fraction u. */
function sourceFractionAt({ table, u }: { table: Table; u: number }): number {
	const target = Math.min(1, Math.max(0, u)) * table.total;
	const c = table.cumulative;
	let lo = 0;
	let hi = TABLE_SIZE;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (c[mid] <= target) lo = mid;
		else hi = mid;
	}
	const step = c[hi] - c[lo];
	const f = step > 0 ? (target - c[lo]) / step : 0;
	return (lo + f) / TABLE_SIZE;
}

/** Source time (from trim start) shown at `clipTime`; same unit as `duration`. */
export function curveSourceTime({
	keyframes,
	clipTime,
	duration,
}: {
	keyframes: SpeedKeyframe[];
	clipTime: number;
	duration: number;
}): number {
	if (duration <= 0) return 0;
	const table = tableFor(keyframes);
	const span = duration / table.total;
	const u = clipTime / duration;
	// Past the ends (transition holds, rounding) the edge speed carries on.
	if (u < 0) return clipTime * speedAt({ keyframes, p: 0 });
	if (u > 1) return span + (clipTime - duration) * speedAt({ keyframes, p: 1 });
	return sourceFractionAt({ table, u }) * span;
}

/** Clip time at which source time (from trim start) is shown. */
export function curveClipTime({
	keyframes,
	sourceTime,
	duration,
}: {
	keyframes: SpeedKeyframe[];
	sourceTime: number;
	duration: number;
}): number {
	if (duration <= 0) return 0;
	const table = tableFor(keyframes);
	const span = duration / table.total;
	const p = sourceTime / span;
	if (p < 0) return sourceTime / speedAt({ keyframes, p: 0 });
	if (p > 1) return duration + (sourceTime - span) / speedAt({ keyframes, p: 1 });
	return clipFractionAt({ table, p }) * duration;
}

/** Speed at clip-time fraction u (for drawing on the timeline). */
export function speedAtClipFraction({ keyframes, u }: { keyframes: SpeedKeyframe[]; u: number }): number {
	return speedAt({ keyframes, p: sourceFractionAt({ table: tableFor(keyframes), u }) });
}

/** Clip-time fraction where a keyframe sits (for drawing on the timeline). */
export function clipFractionOfKeyframe({ keyframes, at }: { keyframes: SpeedKeyframe[]; at: number }): number {
	return clipFractionAt({ table: tableFor(keyframes), p: at });
}

/** Source position under clip-time fraction u (for adding keyframes where clicked). */
export function sourceFractionAtClipFraction({ keyframes, u }: { keyframes: SpeedKeyframe[]; u: number }): number {
	return sourceFractionAt({ table: tableFor(keyframes), u });
}

/**
 * The part of a curve covering source positions [from, to], re-spread to
 * 0–1 (for splitting and trimming without changing what plays).
 */
export function sliceCurve({ keyframes, from, to }: { keyframes: SpeedKeyframe[]; from: number; to: number }): SpeedKeyframe[] {
	const width = to - from;
	if (width <= 0) return keyframes;
	const keys = normalizeCurve(keyframes);
	const inside = keys.filter((k) => k.at > from && k.at < to).map((k) => ({ ...k, at: (k.at - from) / width }));
	// Dense edge samples keep the shape where the cut falls between keyframes.
	const before = keys.filter((k) => k.at <= from).at(-1) ?? keys[0];
	const after = keys.find((k) => k.at >= to) ?? keys[keys.length - 1];
	return normalizeCurve([
		{ ...before, id: `${before.id}-s`, at: 0, speed: speedAt({ keyframes: keys, p: from }) },
		...inside,
		{ ...after, id: `${after.id}-e`, at: 1, speed: speedAt({ keyframes: keys, p: to }) },
	]);
}
