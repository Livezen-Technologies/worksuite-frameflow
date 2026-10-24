/**
 * Text animation data model (JSON-serialisable and versioned). Documented
 * by `text-animation.schema.json` next to this file. Content packs
 * (assets/packs/text-animations, assets/packs/text-templates) store these
 * objects verbatim, so every field is plain data: effects are referenced by
 * id (see `effects.ts`), easings by name or cubic-bezier numbers.
 */

export const TEXT_ANIMATION_VERSION = 1;

/** What one animated piece of the text is. */
export type TextUnit = "grapheme" | "word" | "line" | "block";

export type StaggerOrder = "forward" | "reverse" | "center-out" | "edges-in" | `random(${number})` | "random";

export type Direction = "left" | "right" | "up" | "down" | "in" | "out";

export type NamedEasing =
	| "linear"
	| "ease"
	| "ease-in"
	| "ease-out"
	| "ease-in-out"
	| "ease-in-quad"
	| "ease-out-quad"
	| "ease-in-out-quad"
	| "ease-in-cubic"
	| "ease-out-cubic"
	| "ease-in-out-cubic"
	| "ease-in-quart"
	| "ease-out-quart"
	| "ease-in-expo"
	| "ease-out-expo"
	| "ease-in-out-expo"
	| "ease-in-back"
	| "ease-out-back"
	| "ease-in-out-back"
	| "ease-out-elastic"
	| "ease-out-bounce"
	| "step";

/** A named easing or a CSS-style cubic-bezier [x1, y1, x2, y2]. */
export type Easing = NamedEasing | [number, number, number, number];

/** One phase (in, emphasis or out). Times are seconds. */
export interface TextAnimationPhase {
	/** Effect id from the registry (`TEXT_EFFECTS`), or "none". */
	effect: string;
	/** Per-unit duration (emphasis: one loop period). */
	duration: number;
	/** Before the first unit starts (out: before the clip ends). */
	delay: number;
	/** Seconds between consecutive units. */
	stagger: number;
	staggerOrder: StaggerOrder;
	direction: Direction;
	easing: Easing;
	/** 0–2; 1 is the effect's designed strength. */
	intensity: number;
	/** Effect-specific settings (colours, counts…); see each effect's `params`. */
	params: Record<string, number | string | boolean>;
}

export type KeyframeProperty =
	| "opacity"
	| "x"
	| "y"
	| "scale"
	| "rotation"
	| "skew"
	| "blur"
	| "tracking"
	| "fill"
	| "stroke";

/** `t` is seconds from the clip start; values are numbers, or #RRGGBB for fill/stroke. */
export interface TextKeyframe {
	t: number;
	v: number | string;
	/** Easing from this key to the next. */
	easing?: Easing;
}

/**
 * Hand-made keyframes applied to every unit on top of the phases.
 * x/y/blur/tracking are in em (font size), rotation/skew in degrees,
 * scale is a multiplier, opacity 0–1.
 */
export interface TextKeyframes {
	/** Seconds each unit is delayed relative to the previous one. */
	stagger?: number;
	staggerOrder?: StaggerOrder;
	tracks: Partial<Record<KeyframeProperty, TextKeyframe[]>>;
}

export interface TextAnimation {
	version: typeof TEXT_ANIMATION_VERSION;
	unit: TextUnit;
	in?: TextAnimationPhase;
	/** Loops between in and out. */
	emphasis?: TextAnimationPhase;
	out?: TextAnimationPhase;
	keyframes?: TextKeyframes;
	/**
	 * Per-unit start times (seconds from the clip start), e.g. caption word
	 * timings. When set, unit i's in-phase starts at `unitTimes[i].start`
	 * instead of following the stagger, and karaoke-style effects use the
	 * span as their progress.
	 */
	unitTimes?: Array<{ start: number; end: number }>;
}

/** The look of animated text, independent of the animation. */
export interface TextAnimationStyle {
	fontFamily: string;
	fontWeight: number | "normal" | "bold";
	fontStyle?: "normal" | "italic";
	/** Pixels. */
	fontSize: number;
	/** Extra letter spacing in em. */
	tracking: number;
	/** Multiplier of font size. */
	lineHeight: number;
	align: "left" | "center" | "right";
	fill: string;
	/** Two or more colours fill the text with a horizontal gradient. */
	gradient?: string[] | null;
	stroke?: { color: string; width: number } | null;
	shadow?: { color: string; blur: number; x: number; y: number } | null;
	glow?: { color: string; size: number } | null;
	plate?: { color: string; padding: number; radius: number } | null;
	/** Wrap width in pixels; no wrapping when absent. */
	maxWidth?: number;
}

/**
 * The resolved look of one unit at one moment. Lengths are in em (font
 * size); the renderer converts them. Fields left undefined mean "at rest".
 */
export interface UnitState {
	opacity: number;
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	skewX: number;
	skewY: number;
	blur: number;
	tracking: number;
	fill?: string;
	stroke?: string;
	/** 0–1 visible share, revealed from `clipSide` (mask wipes, boxes). */
	clip?: number;
	clipSide?: "left" | "right" | "top" | "bottom" | "center";
	/** 0–1 share of the unit's graphemes shown (typewriter). */
	reveal?: number;
	caret?: boolean;
	/** Text shown instead of the unit's own (scramble, counters). */
	text?: string;
	/** Chromatic split in em. */
	rgbSplit?: number;
	/** Highlight behind the unit: colour and 0–1 width. */
	highlight?: { color: string; amount: number };
	/** Underline drawn 0–1 from the left. */
	underline?: { color: string; amount: number };
	/** Outline box drawn 0–1. */
	box?: { color: string; amount: number };
	/** 0–1 share of the fill painted in `color` (karaoke). */
	fillSweep?: { color: string; amount: number };
	/** Gradient offset 0–1 (gradient sweep). */
	gradientShift?: { colors: string[]; offset: number };
	/** Light band across the glyphs at 0–1. */
	shine?: number;
	/** 0–1 of the outline drawn, fill fades in at the end. */
	strokeDraw?: number;
	/** Extra glow in em with colour (neon). */
	glow?: { color: string; size: number };
}

export function restState(): UnitState {
	return { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, blur: 0, tracking: 0 };
}
