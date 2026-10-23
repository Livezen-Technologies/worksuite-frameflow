import type { Effect, EffectDefinition } from "@/effects/types";
import type { ParamDefinition, ParamValues } from "@/params";

/**
 * The virtual camera of a 360° clip (SRS VR-08, VR-10, VR-16). It is stored
 * as an effect so every value can be keyframed like any effect parameter,
 * but the compositor draws it as the clip's projection instead of a pass:
 * the sphere has to be sampled before the clip is placed in the frame, and
 * every other effect then applies to the reframed picture (VR-14).
 */
export const REFRAME_EFFECT_TYPE = "reframe-360";

export interface ProjectionDescriptor {
	yaw: number;
	pitch: number;
	roll: number;
	fov: number;
	/** 0 natural, 1 wide, 2 stereographic (tiny planet / rabbit hole). */
	lens: number;
	/** Keep the picture equirectangular and only turn the sphere. */
	equirectangular: boolean;
	/** A flat title or image laid on the sphere (VR-17). */
	place?: boolean;
	/** Half-width of the placed card in tangent units (set by the renderer). */
	planeHalfWidth?: number;
}

export type ProjectionStyle =
	| "natural"
	| "wide"
	| "tiny-planet"
	| "rabbit-hole";

export const PROJECTION_STYLES: {
	value: ProjectionStyle;
	label: string;
	params: { lens: number; fov: number; pitch?: number };
}[] = [
	{ value: "natural", label: "Natural", params: { lens: 0, fov: 90 } },
	{ value: "wide", label: "Wide", params: { lens: 1, fov: 150 } },
	{
		value: "tiny-planet",
		label: "Tiny planet",
		params: { lens: 2, fov: 260, pitch: -90 },
	},
	{
		value: "rabbit-hole",
		label: "Rabbit hole",
		params: { lens: 2, fov: 260, pitch: 90 },
	},
];

const number = ({
	key,
	label,
	min,
	max,
	step,
	value,
}: {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
}): ParamDefinition => ({
	key,
	label,
	type: "number",
	default: value,
	min,
	max,
	step,
});

/** Yaw is not wrapped so keyframes can turn past ±180° (VR-09). */
export const REFRAME_PARAMS: ParamDefinition[] = [
	number({
		key: "yaw",
		label: "Pan",
		min: -720,
		max: 720,
		step: 0.5,
		value: 0,
	}),
	number({
		key: "pitch",
		label: "Tilt",
		min: -90,
		max: 90,
		step: 0.5,
		value: 0,
	}),
	number({
		key: "roll",
		label: "Roll",
		min: -180,
		max: 180,
		step: 0.5,
		value: 0,
	}),
	number({
		key: "fov",
		label: "Field of view",
		min: 20,
		max: 300,
		step: 1,
		value: 90,
	}),
	number({ key: "lens", label: "Lens", min: 0, max: 2, step: 0.01, value: 0 }),
	{
		key: "mode",
		label: "Output",
		type: "select",
		default: "reframe",
		keyframable: false,
		options: [
			{ value: "reframe", label: "Reframe to flat video" },
			{ value: "sphere", label: "Keep 360°" },
		],
	},
];

export const reframeEffectDefinition: EffectDefinition = {
	type: REFRAME_EFFECT_TYPE,
	name: "360° camera",
	keywords: [
		"360",
		"vr",
		"reframe",
		"sphere",
		"tiny planet",
		"equirectangular",
	],
	params: REFRAME_PARAMS,
	renderer: { passes: [] },
};

function read({ params, key }: { params: ParamValues; key: string }): number {
	const value = params[key];
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
	if (Number.isFinite(parsed)) return parsed;
	const fallback = REFRAME_PARAMS.find((p) => p.key === key)?.default;
	return typeof fallback === "number" ? fallback : 0;
}

export function projectionFromParams(
	params: ParamValues,
): ProjectionDescriptor {
	return {
		yaw: read({ params, key: "yaw" }),
		pitch: Math.max(-90, Math.min(90, read({ params, key: "pitch" }))),
		roll: read({ params, key: "roll" }),
		fov: Math.max(1, Math.min(330, read({ params, key: "fov" }))),
		lens: Math.max(0, Math.min(2, read({ params, key: "lens" }))),
		equirectangular: params.mode === "sphere",
	};
}

/**
 * Pins a title, logo or picture to a direction in a 360° project (VR-17):
 * the flat layer becomes a card on the sphere, `size` degrees wide, facing
 * the viewer from yaw/pitch, curved correctly in the equirectangular frame.
 * Every value can be keyframed.
 */
export const SPHERE_PLACE_EFFECT_TYPE = "sphere-place";

export const SPHERE_PLACE_PARAMS: ParamDefinition[] = [
	number({ key: "yaw", label: "Direction (°)", min: -180, max: 180, step: 1, value: 0 }),
	number({ key: "pitch", label: "Height (°)", min: -85, max: 85, step: 1, value: 0 }),
	number({ key: "roll", label: "Tilt (°)", min: -180, max: 180, step: 1, value: 0 }),
	number({ key: "size", label: "Size (%)", min: 10, max: 400, step: 1, value: 100 }),
];

export const spherePlaceEffectDefinition: EffectDefinition = {
	type: SPHERE_PLACE_EFFECT_TYPE,
	name: "Pin to 360° sphere",
	keywords: ["360", "sphere", "pin", "place", "title", "vr", "direction"],
	params: SPHERE_PLACE_PARAMS,
	renderer: { passes: [] },
};

export function findSpherePlaceEffect(effects: Effect[] | undefined): Effect | null {
	return effects?.find((e) => e.type === SPHERE_PLACE_EFFECT_TYPE && e.enabled) ?? null;
}

export function placementFromParams(params: ParamValues): ProjectionDescriptor {
	const get = (key: string) => {
		const v = params[key];
		const fallback = SPHERE_PLACE_PARAMS.find((p) => p.key === key)?.default;
		return typeof v === "number" && Number.isFinite(v) ? v : typeof fallback === "number" ? fallback : 0;
	};
	return {
		yaw: get("yaw"),
		pitch: Math.max(-85, Math.min(85, get("pitch"))),
		roll: get("roll"),
		fov: 90,
		lens: 0,
		equirectangular: false,
		place: true,
		planeHalfWidth: Math.PI / (Math.max(10, Math.min(400, get("size"))) / 100),
	};
}

/**
 * The card's half-width for a layer covering `fraction` of the frame's
 * width: at 100% the middle of the card keeps the size it was laid out at,
 * since the equirectangular frame spans 2π across its width.
 */
export function scalePlacement({
	projection,
	fraction,
}: {
	projection: ProjectionDescriptor;
	fraction: number;
}): ProjectionDescriptor {
	return projection.planeHalfWidth
		? { ...projection, planeHalfWidth: projection.planeHalfWidth * fraction }
		: projection;
}

export function findReframeEffect(
	effects: Effect[] | undefined,
): Effect | null {
	return effects?.find((e) => e.type === REFRAME_EFFECT_TYPE) ?? null;
}

export function defaultReframeParams(): ParamValues {
	return Object.fromEntries(REFRAME_PARAMS.map((p) => [p.key, p.default]));
}

/** Adds the camera first in the stack, so later effects see the reframe. */
export function withReframe({
	effects,
	makeId,
	params,
}: {
	effects: Effect[] | undefined;
	makeId: () => string;
	params?: ParamValues;
}): Effect[] {
	if (findReframeEffect(effects)) return effects ?? [];
	return [
		{
			id: makeId(),
			type: REFRAME_EFFECT_TYPE,
			enabled: true,
			params: { ...defaultReframeParams(), ...params },
		},
		...(effects ?? []),
	];
}

export function withoutReframe(effects: Effect[] | undefined): Effect[] {
	return (effects ?? []).filter((e) => e.type !== REFRAME_EFFECT_TYPE);
}

/**
 * The yaw equal to `target` (mod 360°) nearest `from`, so a keyframe never
 * swings the long way round across the seam (VR-09).
 */
export function nearestYaw({ from, target }: { from: number; target: number }) {
	return target + Math.round((from - target) / 360) * 360;
}

/** Drag on the preview turns the camera: degrees for a pixel delta (VR-09). */
export function dragToAngles({
	dx,
	dy,
	viewHeight,
	fov,
}: {
	dx: number;
	dy: number;
	viewHeight: number;
	fov: number;
}): { yaw: number; pitch: number } {
	const perPixel = Math.min(fov, 180) / Math.max(1, viewHeight);
	return { yaw: -dx * perPixel, pitch: dy * perPixel };
}
