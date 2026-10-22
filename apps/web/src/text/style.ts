import type { ParamDefinition, ParamValues } from "@/params";

/**
 * Text effects beyond fill and background plate (SRS WS-29): stroke,
 * shadow, glow and in/out animations. Sizes are stored as a percentage of
 * the font size so they look the same at any resolution.
 */
export const TEXT_IN_ANIMATIONS = [
	{ value: "none", label: "None" },
	{ value: "fade", label: "Fade" },
	{ value: "typewriter", label: "Typewriter" },
	{ value: "slide-up", label: "Slide up" },
	{ value: "pop", label: "Pop" },
	{ value: "bounce", label: "Bounce" },
] as const;

export const TEXT_OUT_ANIMATIONS = [
	{ value: "none", label: "None" },
	{ value: "fade", label: "Fade" },
	{ value: "slide-down", label: "Slide down" },
	{ value: "pop", label: "Pop" },
] as const;

const whenOn = (param: string) => [{ param, equals: true }];

export const TEXT_STYLE_PARAMS: ParamDefinition[] = [
	{
		key: "stroke.enabled",
		label: "Stroke",
		type: "boolean",
		default: false,
		keyframable: false,
	},
	{
		key: "stroke.color",
		label: "Stroke Color",
		type: "color",
		default: "#000000",
		dependencies: whenOn("stroke.enabled"),
	},
	{
		key: "stroke.width",
		label: "Stroke Width (% of size)",
		type: "number",
		default: 6,
		min: 0,
		max: 40,
		step: 0.5,
		dependencies: whenOn("stroke.enabled"),
	},
	{
		key: "shadow.enabled",
		label: "Shadow",
		type: "boolean",
		default: false,
		keyframable: false,
	},
	{
		key: "shadow.color",
		label: "Shadow Color",
		type: "color",
		default: "#000000",
		dependencies: whenOn("shadow.enabled"),
	},
	{
		key: "shadow.blur",
		label: "Shadow Blur (%)",
		type: "number",
		default: 10,
		min: 0,
		max: 100,
		step: 1,
		dependencies: whenOn("shadow.enabled"),
	},
	{
		key: "shadow.offsetX",
		label: "Shadow X (%)",
		type: "number",
		default: 0,
		min: -100,
		max: 100,
		step: 1,
		dependencies: whenOn("shadow.enabled"),
	},
	{
		key: "shadow.offsetY",
		label: "Shadow Y (%)",
		type: "number",
		default: 6,
		min: -100,
		max: 100,
		step: 1,
		dependencies: whenOn("shadow.enabled"),
	},
	{
		key: "glow.enabled",
		label: "Glow",
		type: "boolean",
		default: false,
		keyframable: false,
	},
	{
		key: "glow.color",
		label: "Glow Color",
		type: "color",
		default: "#2EC4FF",
		dependencies: whenOn("glow.enabled"),
	},
	{
		key: "glow.size",
		label: "Glow Size (%)",
		type: "number",
		default: 30,
		min: 0,
		max: 100,
		step: 1,
		dependencies: whenOn("glow.enabled"),
	},
	{
		key: "animation.in",
		label: "Animate In",
		type: "select",
		default: "none",
		options: TEXT_IN_ANIMATIONS.map(({ value, label }) => ({ value, label })),
		keyframable: false,
	},
	{
		key: "animation.inDuration",
		label: "In Duration (s)",
		type: "number",
		default: 0.6,
		min: 0.1,
		max: 5,
		step: 0.1,
		keyframable: false,
	},
	{
		key: "animation.out",
		label: "Animate Out",
		type: "select",
		default: "none",
		options: TEXT_OUT_ANIMATIONS.map(({ value, label }) => ({ value, label })),
		keyframable: false,
	},
	{
		key: "animation.outDuration",
		label: "Out Duration (s)",
		type: "number",
		default: 0.4,
		min: 0.1,
		max: 5,
		step: 0.1,
		keyframable: false,
	},
];

export const TEXT_STYLE_PARAM_KEYS = TEXT_STYLE_PARAMS.map(
	(param) => param.key,
);

export interface TextStyleEffects {
	stroke?: { color: string; widthPx: number };
	shadow?: {
		color: string;
		blurPx: number;
		offsetXPx: number;
		offsetYPx: number;
	};
	glow?: { color: string; sizePx: number };
	/** Typewriter: how many grapheme clusters are visible, or all when absent. */
	revealGraphemes?: number;
}

function num({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" && value ? value : fallback;
}

/** Stroke, shadow and glow in pixels for a given scaled font size. */
export function readTextStyleEffects({
	params,
	fontSizePx,
}: {
	params: ParamValues;
	fontSizePx: number;
}): TextStyleEffects {
	const pct = ({ key, fallback }: { key: string; fallback: number }) =>
		(num({ params, key, fallback }) / 100) * fontSizePx;
	const effects: TextStyleEffects = {};
	if (params["stroke.enabled"] === true) {
		effects.stroke = {
			color: str({ params, key: "stroke.color", fallback: "#000000" }),
			widthPx: pct({ key: "stroke.width", fallback: 6 }),
		};
	}
	if (params["shadow.enabled"] === true) {
		effects.shadow = {
			color: str({ params, key: "shadow.color", fallback: "#000000" }),
			blurPx: pct({ key: "shadow.blur", fallback: 10 }),
			offsetXPx: pct({ key: "shadow.offsetX", fallback: 0 }),
			offsetYPx: pct({ key: "shadow.offsetY", fallback: 6 }),
		};
	}
	if (params["glow.enabled"] === true) {
		effects.glow = {
			color: str({ params, key: "glow.color", fallback: "#2EC4FF" }),
			sizePx: pct({ key: "glow.size", fallback: 30 }),
		};
	}
	return effects;
}

export interface TextAnimationState {
	opacity: number;
	/** Vertical offset as a fraction of the font size (positive = down). */
	offsetY: number;
	scale: number;
	/** 0–1 share of the text revealed by a typewriter, or 1. */
	reveal: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
function easeOutBack(t: number) {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
function easeOutBounce(t: number) {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (t < 1 / d1) return n1 * t * t;
	if (t < 2 / d1) return n1 * (t - 1.5 / d1) ** 2 + 0.75;
	if (t < 2.5 / d1) return n1 * (t - 2.25 / d1) ** 2 + 0.9375;
	return n1 * (t - 2.625 / d1) ** 2 + 0.984375;
}

/** In and out animation at `localSeconds` into a text clip `durationSeconds` long. */
export function textAnimationState({
	params,
	localSeconds,
	durationSeconds,
}: {
	params: ParamValues;
	localSeconds: number;
	durationSeconds: number;
}): TextAnimationState {
	const state: TextAnimationState = {
		opacity: 1,
		offsetY: 0,
		scale: 1,
		reveal: 1,
	};
	// Keep in and out from overlapping on short clips.
	const half = durationSeconds / 2;
	const inType = str({ params, key: "animation.in", fallback: "none" });
	const outType = str({ params, key: "animation.out", fallback: "none" });
	const inDuration = Math.min(
		num({ params, key: "animation.inDuration", fallback: 0.6 }),
		half,
	);
	const outDuration = Math.min(
		num({ params, key: "animation.outDuration", fallback: 0.4 }),
		half,
	);

	if (inType !== "none" && inDuration > 0 && localSeconds < inDuration) {
		const t = clamp01(localSeconds / inDuration);
		switch (inType) {
			case "fade":
				state.opacity *= t;
				break;
			case "typewriter":
				state.reveal = t;
				break;
			case "slide-up":
				state.opacity *= easeOutCubic(t);
				state.offsetY += (1 - easeOutCubic(t)) * 0.8;
				break;
			case "pop":
				state.opacity *= clamp01(t * 3);
				state.scale *= 0.4 + 0.6 * easeOutBack(t);
				break;
			case "bounce":
				state.opacity *= clamp01(t * 4);
				state.offsetY -= (1 - easeOutBounce(t)) * 1.2;
				break;
		}
	}

	const untilEnd = durationSeconds - localSeconds;
	if (outType !== "none" && outDuration > 0 && untilEnd < outDuration) {
		const t = clamp01(untilEnd / outDuration);
		switch (outType) {
			case "fade":
				state.opacity *= t;
				break;
			case "slide-down":
				state.opacity *= easeOutCubic(t);
				state.offsetY += (1 - easeOutCubic(t)) * 0.8;
				break;
			case "pop":
				state.opacity *= clamp01(t * 3);
				state.scale *= 0.4 + 0.6 * t;
				break;
		}
	}
	return state;
}

export function graphemeCount(text: string): number {
	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	let count = 0;
	for (const _ of segmenter.segment(text)) count++;
	return count;
}

/** The first `count` grapheme clusters of `text` (never splits a Sinhala letter). */
export function sliceGraphemes({
	text,
	count,
}: {
	text: string;
	count: number;
}): string {
	if (count <= 0) return "";
	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	let out = "";
	let taken = 0;
	for (const { segment } of segmenter.segment(text)) {
		if (taken >= count) break;
		out += segment;
		taken++;
	}
	return out;
}
