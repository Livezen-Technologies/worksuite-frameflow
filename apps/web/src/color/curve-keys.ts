import {
	type CurveChannel,
	type CurvePoint,
	type Curves,
	evaluateCurve,
	isHueChannel,
	parseCurve,
	serializeCurve,
} from "./curves";

/**
 * Keyframed curves (SRS WS-15): each key holds the whole set of curves at a
 * time in the clip. Between keys every curve is sampled at the same points
 * and blended, so curves with different points still morph smoothly.
 */
export interface CurveKey {
	/** Seconds into the clip. */
	t: number;
	curves: Record<CurveChannel, string>;
}

const CHANNELS: CurveChannel[] = ["luma", "red", "green", "blue", "hueVsHue", "hueVsSat"];
const SAMPLES = 17;
/** Blend amounts are rounded to this many steps, so a move between two keys bakes at most this many LUTs. */
export const BLEND_STEPS = 24;

export function parseCurveKeys(text: unknown): CurveKey[] {
	if (typeof text !== "string" || !text) return [];
	try {
		const raw: unknown = JSON.parse(text);
		if (!Array.isArray(raw)) return [];
		return raw
			.filter(
				(k): k is CurveKey =>
					!!k && typeof k === "object" && typeof k.t === "number" && !!k.curves && typeof k.curves === "object",
			)
			.sort((a, b) => a.t - b.t);
	} catch {
		return [];
	}
}

export const serializeCurveKeys = (keys: CurveKey[]) =>
	keys.length ? JSON.stringify([...keys].sort((a, b) => a.t - b.t)) : "";

export function keyFromCurves({ t, curves }: { t: number; curves: Curves }): CurveKey {
	return {
		t,
		curves: {
			luma: serializeCurve(curves.luma),
			red: serializeCurve(curves.red),
			green: serializeCurve(curves.green),
			blue: serializeCurve(curves.blue),
			hueVsHue: serializeCurve(curves.hueVsHue),
			hueVsSat: serializeCurve(curves.hueVsSat),
		},
	};
}

function curvesOf({ key, fallback }: { key: CurveKey; fallback: Curves }): Curves {
	const out = { ...fallback };
	for (const c of CHANNELS) out[c] = parseCurve({ text: key.curves[c], fallback: fallback[c] });
	return out;
}

/** Curves at `t` seconds: held before the first key and after the last, blended between. */
export function curvesAt({ keys, t, fallback }: { keys: CurveKey[]; t: number; fallback: Curves }): Curves {
	if (!keys.length) return fallback;
	const first = keys[0]!;
	const last = keys[keys.length - 1]!;
	if (t <= first.t) return curvesOf({ key: first, fallback });
	if (t >= last.t) return curvesOf({ key: last, fallback });
	const i = keys.findIndex((k) => k.t > t);
	const a = curvesOf({ key: keys[i - 1]!, fallback });
	const b = curvesOf({ key: keys[i]!, fallback });
	const span = keys[i]!.t - keys[i - 1]!.t;
	const u = Math.round(((t - keys[i - 1]!.t) / span) * BLEND_STEPS) / BLEND_STEPS;
	if (u === 0) return a;
	if (u === 1) return b;
	const out = { ...fallback };
	for (const c of CHANNELS) {
		const periodic = isHueChannel(c);
		const points: CurvePoint[] = [];
		for (let s = 0; s < SAMPLES; s++) {
			const x = s / (SAMPLES - 1);
			const ya = evaluateCurve({ points: a[c], x, periodic });
			const yb = evaluateCurve({ points: b[c], x, periodic });
			points.push([x, ya + (yb - ya) * u]);
		}
		out[c] = points;
	}
	return out;
}

/** Sets the key at `t` (within half a frame) or adds one. */
export function upsertKey({ keys, key, tolerance = 1 / 60 }: { keys: CurveKey[]; key: CurveKey; tolerance?: number }): CurveKey[] {
	const rest = keys.filter((k) => Math.abs(k.t - key.t) > tolerance);
	return [...rest, key].sort((a, b) => a.t - b.t);
}
