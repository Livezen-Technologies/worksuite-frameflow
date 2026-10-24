import { applyEasing, clamp01, easingFunction } from "./easing";
import { getTextEffect } from "./effects";
import { seededPermutation } from "./random";
import {
	restState,
	TEXT_ANIMATION_VERSION,
	type KeyframeProperty,
	type StaggerOrder,
	type TextAnimation,
	type TextAnimationPhase,
	type TextKeyframe,
	type UnitState,
} from "./types";

/** Rank of each unit (0 starts first) for a stagger order. */
export function staggerRanks(count: number, order: StaggerOrder | undefined): number[] {
	const ranks = new Array<number>(count);
	const o = order ?? "forward";
	if (o === "reverse") for (let i = 0; i < count; i++) ranks[i] = count - 1 - i;
	else if (o === "center-out" || o === "edges-in") {
		const mid = (count - 1) / 2;
		const maxD = Math.ceil(mid);
		for (let i = 0; i < count; i++) {
			const d = Math.round(Math.abs(i - mid) * 2) / 2;
			ranks[i] = o === "center-out" ? Math.floor(d) : maxD - Math.ceil(d);
		}
	} else if (o.startsWith("random")) {
		const m = /random\((-?\d+)\)/.exec(o);
		const perm = seededPermutation(count, m ? Number(m[1]) : 1);
		for (let i = 0; i < count; i++) ranks[perm[i]!] = i;
	} else for (let i = 0; i < count; i++) ranks[i] = i;
	return ranks;
}

export function maxRank(ranks: number[]): number {
	let m = 0;
	for (const r of ranks) if (r > m) m = r;
	return m;
}

/** Seconds the in phase takes from the clip start until every unit is at rest. */
export function phaseSpan(phase: TextAnimationPhase | undefined, count: number, order?: StaggerOrder): number {
	if (!phase || phase.effect === "none") return 0;
	const ranks = staggerRanks(count, order ?? phase.staggerOrder);
	return phase.delay + phase.duration + phase.stagger * maxRank(ranks);
}

export interface EvaluateOptions {
	animation: TextAnimation;
	/** Unit texts in reading order (whitespace excluded). */
	units: string[];
	/** Seconds from the clip start. */
	time: number;
	/** Clip length in seconds. */
	duration: number;
}

function mergeInto(target: UnitState, part: Partial<UnitState>) {
	for (const [key, value] of Object.entries(part) as Array<[keyof UnitState, unknown]>) {
		if (value === undefined) continue;
		if (key === "opacity" || key === "scaleX" || key === "scaleY") (target[key] as number) *= value as number;
		else if (key === "x" || key === "y" || key === "rotation" || key === "skewX" || key === "skewY" || key === "blur" || key === "tracking" || key === "rgbSplit")
			(target[key] as number) = ((target[key] as number | undefined) ?? 0) + (value as number);
		else if (key === "clip" || key === "reveal" || key === "strokeDraw" || key === "shine")
			(target[key] as number) = Math.min((target[key] as number | undefined) ?? 1, value as number);
		else (target as unknown as Record<string, unknown>)[key] = value;
	}
}

const randomSeedRate = (phase: TextAnimationPhase) => {
	const rate = phase.params.rate;
	return typeof rate === "number" && rate > 0 ? rate : 10;
};

function runEffect({
	phase,
	which,
	index,
	count,
	p,
	raw,
	text,
	time,
}: {
	phase: TextAnimationPhase;
	which: "in" | "emphasis" | "out";
	index: number;
	count: number;
	p: number;
	raw: number;
	text: string;
	time: number;
}): Partial<UnitState> {
	const effect = getTextEffect(phase.effect);
	if (!effect) return {};
	return effect.fn({
		index,
		count,
		p,
		raw,
		phase: which,
		direction: phase.direction,
		intensity: Math.max(0, Math.min(2, phase.intensity ?? 1)),
		params: { ...(effect.params ?? {}), ...phase.params },
		text,
		time,
		seed: Math.floor(time * randomSeedRate(phase) + 1e-6),
	});
}

/** Interpolates a keyframe track at `t` (numbers or #RRGGBB colours). */
export function evaluateKeyframes(keys: TextKeyframe[] | undefined, t: number): number | string | undefined {
	if (!keys || keys.length === 0) return undefined;
	const sorted = keys.length > 1 && keys.some((k, i) => i > 0 && k.t < keys[i - 1]!.t) ? [...keys].sort((a, b) => a.t - b.t) : keys;
	const first = sorted[0]!;
	const last = sorted[sorted.length - 1]!;
	if (t <= first.t) return first.v;
	if (t >= last.t) return last.v;
	for (let i = 0; i < sorted.length - 1; i++) {
		const a = sorted[i]!;
		const b = sorted[i + 1]!;
		if (t >= a.t && t <= b.t) {
			const span = b.t - a.t;
			const e = span > 0 ? easingFunction(a.easing ?? "linear")(clamp01((t - a.t) / span)) : 1;
			if (typeof a.v === "number" && typeof b.v === "number") return a.v + (b.v - a.v) * e;
			if (typeof a.v === "string" && typeof b.v === "string") return mixHex(a.v, b.v, e);
			return e < 1 ? a.v : b.v;
		}
	}
	return last.v;
}

export function mixHex(a: string, b: string, t: number): string {
	const pa = parseHex(a);
	const pb = parseHex(b);
	if (!pa || !pb) return t < 0.5 ? a : b;
	const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * clamp01(t)));
	return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function parseHex(hex: string): [number, number, number] | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = Number.parseInt(m[1]!, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const KEY_APPLY: Record<KeyframeProperty, (s: UnitState, v: number | string) => void> = {
	opacity: (s, v) => typeof v === "number" && (s.opacity *= clamp01(v)),
	x: (s, v) => typeof v === "number" && (s.x += v),
	y: (s, v) => typeof v === "number" && (s.y += v),
	scale: (s, v) => {
		if (typeof v !== "number") return;
		s.scaleX *= v;
		s.scaleY *= v;
	},
	rotation: (s, v) => typeof v === "number" && (s.rotation += v),
	skew: (s, v) => typeof v === "number" && (s.skewX += v),
	blur: (s, v) => typeof v === "number" && (s.blur += Math.max(0, v)),
	tracking: (s, v) => typeof v === "number" && (s.tracking += v),
	fill: (s, v) => typeof v === "string" && (s.fill = v),
	stroke: (s, v) => typeof v === "string" && (s.stroke = v),
};

/**
 * The state of every unit at `time`. Pure and deterministic: the same
 * inputs always give the same output, which is what keeps the preview and
 * the export identical.
 */
export function evaluateTextAnimation({ animation, units, time, duration }: EvaluateOptions): UnitState[] {
	const count = units.length;
	const out = units.map(() => restState());
	if (count === 0) return out;
	const { in: inPhase, emphasis, out: outPhase, keyframes } = animation;

	const inActive = inPhase && inPhase.effect !== "none" ? inPhase : undefined;
	const outActive = outPhase && outPhase.effect !== "none" ? outPhase : undefined;
	const inRanks = inActive ? staggerRanks(count, inActive.staggerOrder) : [];
	const outRanks = outActive ? staggerRanks(count, outActive.staggerOrder) : [];
	const outSpan = outActive ? phaseSpan(outActive, count) : 0;
	const outStart = Math.max(0, duration - outSpan);
	const inEnd = inActive ? phaseSpan(inActive, count) : 0;
	const times = animation.unitTimes && animation.unitTimes.length === count ? animation.unitTimes : null;

	for (let i = 0; i < count; i++) {
		const state = out[i]!;
		const text = units[i]!;
		if (inActive) {
			const start = times ? times[i]!.start : inActive.delay + inActive.stagger * inRanks[i]!;
			const dur = times && inActive.effect === "karaoke-fill" ? Math.max(0.01, times[i]!.end - times[i]!.start) : inActive.duration;
			const raw = dur > 0 ? clamp01((time - start) / dur) : time >= start ? 1 : 0;
			if (raw < 1 || inActive.effect === "karaoke-fill" || inActive.effect === "highlight-sweep")
				mergeInto(state, runEffect({ phase: inActive, which: "in", index: i, count, p: applyEasing(inActive.easing, raw), raw, text, time }));
		}
		if (emphasis && emphasis.effect !== "none" && emphasis.duration > 0) {
			const start = Math.max(inEnd, 0) + emphasis.delay;
			const end = outActive ? outStart : duration;
			if (time >= start && time < end) {
				const offset = emphasis.stagger * i;
				const local = (time - start - offset) / emphasis.duration;
				const phase = local < 0 ? 0 : local - Math.floor(local);
				const eased = emphasis.easing === "linear" ? phase : applyEasing(emphasis.easing, phase);
				mergeInto(state, runEffect({ phase: emphasis, which: "emphasis", index: i, count, p: local < 0 ? 0 : eased, raw: phase, text, time }));
			}
		}
		if (outActive) {
			const start = outStart + outActive.delay + outActive.stagger * outRanks[i]!;
			const raw = outActive.duration > 0 ? clamp01((time - start) / outActive.duration) : time >= start ? 1 : 0;
			if (raw > 0) {
				const back = 1 - raw;
				mergeInto(state, runEffect({ phase: outActive, which: "out", index: i, count, p: 1 - applyEasing(outActive.easing, raw), raw: back, text, time }));
			}
		}
		if (keyframes) {
			const ranks = staggerRanks(count, keyframes.staggerOrder);
			const local = time - (keyframes.stagger ?? 0) * ranks[i]!;
			for (const [prop, keys] of Object.entries(keyframes.tracks) as Array<[KeyframeProperty, TextKeyframe[]]>) {
				const v = evaluateKeyframes(keys, local);
				if (v !== undefined) KEY_APPLY[prop]?.(state, v);
			}
		}
		state.opacity = clamp01(state.opacity);
		state.blur = Math.max(0, state.blur);
	}
	return out;
}

/** A phase with an effect's defaults (what the Properties panel creates). */
export function defaultPhase(effectId: string, which: "in" | "emphasis" | "out" = "in"): TextAnimationPhase {
	const effect = getTextEffect(effectId);
	const d = effect?.defaults;
	return {
		effect: effect ? effectId : "none",
		duration: d?.duration ?? 0.5,
		delay: 0,
		stagger: which === "emphasis" ? (d?.stagger ?? 0) : (d?.stagger ?? 0.05),
		staggerOrder: "forward",
		direction: d?.direction ?? "up",
		easing: which === "emphasis" ? (d?.easing === "step" ? "step" : "linear") : (d?.easing ?? "ease-out"),
		intensity: 1,
		params: {},
	};
}

export function createTextAnimation(partial: Partial<TextAnimation> = {}): TextAnimation {
	return { version: TEXT_ANIMATION_VERSION, unit: partial.unit ?? "word", ...partial };
}
