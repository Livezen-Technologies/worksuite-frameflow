import {
	ANIMATION_PARAMS,
	type AnimationState,
	animationState,
} from "@/animation/clip-animation";
import type { ParamDefinition, ParamValues } from "@/params";

/**
 * Text effects beyond fill and background plate (SRS WS-29): stroke,
 * shadow, glow and in/out animations. Sizes are stored as a percentage of
 * the font size so they look the same at any resolution.
 */
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
	...ANIMATION_PARAMS,
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
	/** The word being spoken, counted across lines, drawn in `color` (AI-46). */
	highlightWord?: { index: number; color: string };
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

export type TextAnimationState = AnimationState;

/** In, out and combo animation for a text clip (shared with other clips). */
export const textAnimationState = animationState;

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
