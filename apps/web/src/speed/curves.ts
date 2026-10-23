import type { TimelineElement } from "@/timeline";

/**
 * Speed curves (Speed › Curve). A curve is a list of speed multipliers
 * spread evenly over the clip's source. Applying one splits the clip into
 * short pieces, each played at a constant speed, so playback, audio,
 * trimming and export all keep working as they do for any retimed clip.
 * The pieces share a group id so the curve can be removed or replaced.
 */
export type CurvePresetId =
	| "montage"
	| "hero"
	| "bullet"
	| "jump-cut"
	| "flash-in"
	| "flash-out"
	| "custom";

export const CURVE_PRESETS: {
	id: CurvePresetId;
	label: string;
	points: number[];
}[] = [
	{ id: "montage", label: "Montage", points: [1, 2.5, 1, 0.35, 1] },
	{ id: "hero", label: "Hero", points: [1.8, 1.8, 0.25, 1.8, 0.25, 1.8, 1.8] },
	{ id: "bullet", label: "Bullet", points: [1.8, 1.8, 0.15, 1.8, 1.8] },
	{ id: "jump-cut", label: "Jump Cut", points: [0.6, 0.6, 3, 0.6, 0.6] },
	{ id: "flash-in", label: "Flash In", points: [3, 3, 1.2, 0.7, 0.7] },
	{ id: "flash-out", label: "Flash Out", points: [0.7, 0.7, 1.2, 3, 3] },
	{ id: "custom", label: "Custom", points: [1, 1, 1, 1, 1] },
];

export const CURVE_GROUP_PARAM = "speedCurve.group";
export const CURVE_PRESET_PARAM = "speedCurve.preset";
export const CURVE_POINTS_PARAM = "speedCurve.points";
export const CURVE_BASE_PARAM = "speedCurve.base";

const MIN_RATE = 0.1;
const MAX_RATE = 5;
export const CURVE_SEGMENTS = 16;

/** Multiplier at position u ∈ [0, 1], linear between control points. */
export function curveAt({
	points,
	u,
}: {
	points: number[];
	u: number;
}): number {
	if (points.length === 0) return 1;
	if (points.length === 1) return points[0] ?? 1;
	const x = Math.max(0, Math.min(1, u)) * (points.length - 1);
	const i = Math.min(points.length - 2, Math.floor(x));
	const f = x - i;
	return (points[i] ?? 1) * (1 - f) + (points[i + 1] ?? 1) * f;
}

type Ticks = number;

export interface CurveSource {
	id: string;
	startTime: Ticks;
	trimStart: Ticks;
	trimEnd: Ticks;
	/** Source ticks the clip covers. */
	sourceSpan: Ticks;
}

export interface CurvePiece {
	startTime: Ticks;
	duration: Ticks;
	trimStart: Ticks;
	trimEnd: Ticks;
	rate: number;
}

/** The pieces a curve turns a clip into, in timeline order. */
export function buildCurvePieces({
	source,
	points,
	base = 1,
	segments = CURVE_SEGMENTS,
}: {
	source: CurveSource;
	points: number[];
	base?: number;
	segments?: number;
}): CurvePiece[] {
	const pieces: CurvePiece[] = [];
	let time = source.startTime;
	let consumed = 0;
	for (let i = 0; i < segments; i++) {
		const end = Math.round((source.sourceSpan * (i + 1)) / segments);
		const span = end - consumed;
		if (span <= 0) continue;
		const rate = Math.max(
			MIN_RATE,
			Math.min(MAX_RATE, base * curveAt({ points, u: (i + 0.5) / segments })),
		);
		const duration = Math.max(1, Math.round(span / rate));
		pieces.push({
			startTime: time,
			duration,
			trimStart: source.trimStart + consumed,
			trimEnd: source.trimEnd + (source.sourceSpan - end),
			rate,
		});
		time += duration;
		consumed = end;
	}
	return pieces;
}

/** Elements of one curve group on a track, in order. */
export function curveGroupOf({
	elements,
	group,
}: {
	elements: TimelineElement[];
	group: string;
}): TimelineElement[] {
	return elements
		.filter((e) => e.params[CURVE_GROUP_PARAM] === group)
		.sort((a, b) => a.startTime - b.startTime);
}
