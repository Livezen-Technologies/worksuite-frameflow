import type { Effect } from "@/effects/types";
import type { ParamValues } from "@/params";

/**
 * Filters (the Filters sidebar): one-click looks for a clip. A filter is a
 * colour grade plus optional finishing effects (vignette, grain, sepia),
 * stored as ordinary clip effects whose ids start with "filter-", so they
 * show up and stay editable in the clip's Effects tab.
 */
export type FilterCategory =
	| "Portrait"
	| "Vivid"
	| "Film"
	| "Cinematic"
	| "Mono"
	| "Mood";

export const FILTER_CATEGORIES: FilterCategory[] = [
	"Portrait",
	"Vivid",
	"Film",
	"Cinematic",
	"Mono",
	"Mood",
];

export interface FilterPreset {
	id: string;
	name: string;
	category: FilterCategory;
	/** color-grade params in display units (sliders −100…100, exposure in stops). */
	grade: ParamValues;
	extras?: { type: "vignette" | "film-grain" | "sepia"; params: ParamValues }[];
}

export const FILTER_PRESETS: FilterPreset[] = [
	{
		id: "soft-skin",
		name: "Soft Skin",
		category: "Portrait",
		grade: {
			exposure: 0.15,
			contrast: -12,
			temperature: 8,
			saturation: -6,
			highlights: -15,
			shadows: 12,
		},
	},
	{
		id: "warm-glow",
		name: "Warm Glow",
		category: "Portrait",
		grade: {
			exposure: 0.1,
			temperature: 22,
			tint: 4,
			vibrance: 10,
			highlights: -10,
		},
	},
	{
		id: "natural",
		name: "Natural",
		category: "Portrait",
		grade: { contrast: 6, vibrance: 12, shadows: 6 },
	},
	{
		id: "vivid",
		name: "Vivid",
		category: "Vivid",
		grade: { contrast: 18, saturation: 22, vibrance: 18 },
	},
	{
		id: "tropical",
		name: "Tropical",
		category: "Vivid",
		grade: {
			temperature: 10,
			tint: -8,
			saturation: 25,
			vibrance: 20,
			contrast: 10,
		},
	},
	{
		id: "ceylon-tea",
		name: "Ceylon Tea",
		category: "Vivid",
		grade: {
			temperature: -6,
			tint: -14,
			saturation: 18,
			contrast: 12,
			shadows: 8,
		},
	},
	{
		id: "pop",
		name: "Pop",
		category: "Vivid",
		grade: { contrast: 28, saturation: 35, highlights: -8, shadows: -6 },
	},
	{
		id: "kodak",
		name: "Kodak 200",
		category: "Film",
		grade: {
			temperature: 14,
			contrast: 10,
			saturation: 8,
			shadows: 10,
			liftX: 0.3,
			liftY: 0.1,
			liftM: 0.08,
		},
		extras: [
			{ type: "film-grain", params: { strength: 25, size: 40, color: 20 } },
		],
	},
	{
		id: "faded",
		name: "Faded",
		category: "Film",
		grade: { contrast: -28, saturation: -20, liftM: 0.35, highlights: -12 },
		extras: [
			{ type: "film-grain", params: { strength: 18, size: 35, color: 10 } },
		],
	},
	{
		id: "polaroid",
		name: "Polaroid",
		category: "Film",
		grade: {
			temperature: 12,
			tint: 6,
			contrast: -10,
			saturation: -8,
			liftX: 0.15,
			liftY: 0.12,
			liftM: 0.2,
		},
		extras: [
			{ type: "vignette", params: { amount: 35, size: 60, softness: 60 } },
		],
	},
	{
		id: "teal-orange",
		name: "Teal & Orange",
		category: "Cinematic",
		grade: {
			contrast: 18,
			saturation: 8,
			liftX: -0.6,
			liftY: -0.25,
			liftM: -0.05,
			gainX: 0.6,
			gainY: 0.2,
		},
		extras: [
			{ type: "vignette", params: { amount: 30, size: 65, softness: 55 } },
		],
	},
	{
		id: "blockbuster",
		name: "Blockbuster",
		category: "Cinematic",
		grade: {
			exposure: -0.15,
			contrast: 30,
			saturation: -10,
			temperature: -8,
			highlights: -20,
			shadows: -12,
		},
		extras: [
			{ type: "vignette", params: { amount: 45, size: 60, softness: 60 } },
		],
	},
	{
		id: "golden-hour",
		name: "Golden Hour",
		category: "Cinematic",
		grade: {
			temperature: 30,
			tint: 8,
			contrast: 12,
			highlights: -18,
			vibrance: 12,
			gainM: 0.1,
		},
	},
	{
		id: "bw-classic",
		name: "B&W Classic",
		category: "Mono",
		grade: { saturation: -100, contrast: 20 },
	},
	{
		id: "bw-high",
		name: "B&W High",
		category: "Mono",
		grade: { saturation: -100, contrast: 45, shadows: -15 },
		extras: [
			{ type: "film-grain", params: { strength: 20, size: 40, color: 0 } },
		],
	},
	{
		id: "sepia",
		name: "Sepia",
		category: "Mono",
		grade: { contrast: 8 },
		extras: [
			{ type: "sepia", params: { amount: 85 } },
			{ type: "vignette", params: { amount: 30, size: 60, softness: 60 } },
		],
	},
	{
		id: "moody",
		name: "Moody",
		category: "Mood",
		grade: {
			exposure: -0.3,
			contrast: 22,
			saturation: -30,
			temperature: -10,
			shadows: -18,
		},
		extras: [
			{ type: "vignette", params: { amount: 50, size: 55, softness: 60 } },
		],
	},
	{
		id: "night-blue",
		name: "Night Blue",
		category: "Mood",
		grade: {
			exposure: -0.4,
			temperature: -35,
			tint: 6,
			contrast: 15,
			saturation: -12,
		},
	},
	{
		id: "dreamy",
		name: "Dreamy",
		category: "Mood",
		grade: {
			exposure: 0.25,
			contrast: -25,
			tint: 12,
			saturation: -8,
			highlights: -10,
			liftM: 0.2,
		},
	},
];

export const FILTER_EFFECT_PREFIX = "filter-";
const STRENGTH_KEY = "filter.strength";
const ID_KEY = "filter.id";

export function isFilterEffect(effect: Effect): boolean {
	return effect.id.startsWith(FILTER_EFFECT_PREFIX);
}

/** Which filter a clip has, and at what strength, from its effects. */
export function readClipFilter(
	effects: Effect[] | undefined,
): { id: string; strength: number } | null {
	const grade = (effects ?? []).find(
		(e) => isFilterEffect(e) && e.type === "color-grade",
	);
	if (!grade) return null;
	const id = grade.params[ID_KEY];
	const strength = grade.params[STRENGTH_KEY];
	return typeof id === "string"
		? { id, strength: typeof strength === "number" ? strength : 100 }
		: null;
}

function scale({
	params,
	factor,
}: {
	params: ParamValues;
	factor: number;
}): ParamValues {
	const out: ParamValues = {};
	for (const [key, value] of Object.entries(params)) {
		out[key] =
			typeof value === "number"
				? Math.round(value * factor * 1000) / 1000
				: value;
	}
	return out;
}

/** Grade params for a preset at a strength (0–100), for previews. */
export function filterGradeParams({
	preset,
	strength,
}: {
	preset: FilterPreset;
	strength: number;
}): ParamValues {
	return scale({ params: preset.grade, factor: strength / 100 });
}

/**
 * A clip's effects with its filter replaced (or removed when `preset` is
 * null). Other effects keep their order; the filter goes first so effects
 * the user added work on the graded picture.
 */
export function withFilter({
	effects,
	preset,
	strength = 100,
	makeId,
}: {
	effects: Effect[] | undefined;
	preset: FilterPreset | null;
	strength?: number;
	makeId: () => string;
}): Effect[] {
	const rest = (effects ?? []).filter((e) => !isFilterEffect(e));
	if (!preset) return rest;
	const factor = strength / 100;
	const filter: Effect[] = [
		{
			id: `${FILTER_EFFECT_PREFIX}${makeId()}`,
			type: "color-grade",
			enabled: true,
			params: {
				...scale({ params: preset.grade, factor }),
				[ID_KEY]: preset.id,
				[STRENGTH_KEY]: strength,
			},
		},
		...(preset.extras ?? []).map((extra) => ({
			id: `${FILTER_EFFECT_PREFIX}${makeId()}`,
			type: extra.type,
			enabled: true,
			params: scale({ params: extra.params, factor }),
		})),
	];
	return [...filter, ...rest];
}
