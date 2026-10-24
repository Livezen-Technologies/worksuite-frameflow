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

/** A language version of a pack asset: same timing and colour slots, different words. */
export interface LottieVariant {
	id: string;
	/** In the language itself, e.g. "සිංහල". */
	name: string;
	lang: string;
}

/** A word or line the Motion Editor can replace with live text (layer `slot:text:<id>`). */
export interface LottieTextSlot {
	id: string;
	name: string;
	layer: string;
	/** Default words per language (en, si, ta). */
	defaults: Record<string, string>;
	fontFamily: string;
	fontWeight: number;
	/** Composition pixels; the text shrinks to fit `box`. */
	fontSize: number;
	/** Composition coordinates at rest. */
	box: { x: number; y: number; w: number; h: number };
	/** The slot layer's position at rest. */
	origin: [number, number];
	align: "left" | "center" | "right";
	/** Colour slot id. */
	color: string;
	uppercase?: boolean;
}

/** A picture slot (layer `slot:image:<id>`, whose shape is the mask). */
export interface LottieImageSlot {
	id: string;
	name: string;
	layer: string;
	mask: { shape: "ellipse" | "rect"; w: number; h: number; radius?: number };
	origin: [number, number];
	box: { x: number; y: number; w: number; h: number };
	placeholder: string;
	aspect: string;
}

/** A user's text for a slot. Absent fields keep the slot's defaults. */
export interface TextSlotOverride {
	text?: string;
	fontFamily?: string;
	fontWeight?: number;
	/** Multiplier on the slot's font size. */
	sizeScale?: number;
	/** Extra spacing in em. */
	letterSpacing?: number;
	case?: "as-typed" | "upper" | "lower" | "title";
	/** #RRGGBB; otherwise the slot's colour slot (after colour overrides). */
	color?: string;
	/** Animates the slot's words (text-animation engine); time is the clip's. */
	textAnimation?: import("@/text-animation/types").TextAnimation;
}

/** A user's picture in an image slot. */
export interface ImageSlotOverride {
	/** Data URL (downscaled) so the project stays self-contained. */
	src: string;
	name?: string;
	fit: "fill" | "fit";
	/** 1 = just covers/fits the mask. */
	zoom: number;
	/** Offset as a share of the mask size (-1..1). */
	offsetX: number;
	offsetY: number;
}

/** Non-destructive Motion Editor edits on a clip; they survive pack updates. */
export interface LottieSlotOverrides {
	text?: Record<string, TextSlotOverride>;
	image?: Record<string, ImageSlotOverride>;
	/** Named layers or slots switched off. */
	hidden?: string[];
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
	/** Language variants (the first is the default); absent for assets without words. */
	defaultVariant?: string;
	variants?: Array<LottieVariant & { file: string; thumbnail: string }>;
	/** Sound effects timed to the animation; `file` is relative to the asset folder. */
	sounds?: Array<{ file: string; at: number; gainDb?: number }>;
	textSlots?: LottieTextSlot[];
	imageSlots?: LottieImageSlot[];
}

/** Where an animation element's Lottie comes from. */
export type LottieSource =
	| {
			kind: "pack";
			assetId: string;
			/** Language variant; the default when absent. */
			variant?: string;
			/**
			 * The download-center pack it comes from (`packId@version/assetId`).
			 * Absent for the built-in packs, which are found by asset id alone.
			 */
			pack?: { id: string; version: string };
	  }
	| { kind: "user"; id: string }
	/** A template background built from a short recipe (text-library/backdrop.ts). */
	| { kind: "backdrop"; spec: string };

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
	/** Added before its pack finished downloading: size and length are guesses until it resolves. */
	placeholder?: boolean;
	/** Motion Editor: text, pictures and hidden layers. */
	slots?: LottieSlotOverrides;
	/** Motion Editor timing, in seconds of animation time. */
	timing?: { delay?: number; endHold?: number; trimIn?: number; trimOut?: number };
	/** Motion Editor sound edits, by cue index: muted, replaced (library sound URL) or nudged (s). */
	sounds?: Record<string, { muted?: boolean; url?: string; nudge?: number }>;
}

export const LOTTIE_GRAPHIC_DEFINITION_ID = "lottie";
