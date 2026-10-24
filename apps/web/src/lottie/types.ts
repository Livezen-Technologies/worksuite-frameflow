/** Loose shape of a Lottie (Bodymovin) document; only the fields we read. */
export interface LottieJson {
	v?: string;
	fr: number;
	ip: number;
	op: number;
	w: number;
	h: number;
	nm?: string;
	layers: unknown[];
	assets?: unknown[];
	[key: string]: unknown;
}

/** A recolourable colour in an animation. `default` is the colour as authored. */
export interface LottieColorSlot {
	id: string;
	name: string;
	default: string;
}

/** `asset.json` next to each animation in the Worksuite Assets pack. */
export interface WorksuiteAssetMeta {
	schema: 1;
	id: string;
	name: string;
	category: string;
	type: "lottie";
	file: string;
	thumbnail: string;
	license: string;
	description: string;
	tags: string[];
	durationSec: number;
	loop: boolean;
	aspect: string;
	width: number;
	height: number;
	colors: LottieColorSlot[];
}

/** Where an animation element's Lottie comes from. */
export type LottieSource =
	| { kind: "pack"; assetId: string }
	| { kind: "user"; id: string };

/**
 * What an animation (Lottie) graphic element stores: a reference to the
 * animation, never the animation itself, plus its colour overrides.
 */
export interface LottieElementData {
	source: LottieSource;
	/** Authored colour (#RRGGBB) → colour to draw instead. Static, not keyframed. */
	colors: Record<string, string>;
	width: number;
	height: number;
	fps: number;
	/** Animation length in frames (op − ip). */
	frames: number;
	loop: boolean;
	/** Playback speed; 1 is as authored. */
	speed: number;
}

export const LOTTIE_GRAPHIC_DEFINITION_ID = "lottie";
