import { EASE, type Ease, type Key, type LayerInput } from "../lottie-dsl";

/** The Worksuite palette: the default colours of every asset. */
export const PALETTE = {
	blue: "#4C8DFF",
	teal: "#2EC4B6",
	amber: "#F5A524",
	white: "#FFFFFF",
	ink: "#0F1115",
} as const;

export interface ColorSlotDef {
	id: string;
	name: string;
	default: string;
}

export interface AssetContext {
	/** The colour of a slot, by id. */
	c: (slot: string) => string;
	w: number;
	h: number;
	frames: number;
	fps: number;
}

export interface AssetDef {
	id: string;
	name: string;
	category: string;
	description: string;
	tags: string[];
	durationSec: number;
	loop: boolean;
	w: number;
	h: number;
	colors: ColorSlotDef[];
	/** Thumbnail frame as a share of the timeline (default 0.6). */
	thumbAt?: number;
	build: (ctx: AssetContext) => LayerInput[];
}

export const slot = (id: string, name: string, color: string): ColorSlotDef => ({
	id,
	name,
	default: color,
});

export const SQUARE = { w: 1080, h: 1080 } as const;
export const WIDE = { w: 1920, h: 1080 } as const;

/** Consistent line weights across the pack (at 1080 px). */
export const LINE = { bold: 28, regular: 20, thin: 10 } as const;

/**
 * In → hold → out: `a` before `inStart`, eases to `b` by `inEnd`, holds,
 * and eases back to `a` between `outStart` and `outEnd`.
 */
export function inOut<T extends number | number[]>(
	[inStart, inEnd, outStart, outEnd]: [number, number, number, number],
	a: T,
	b: T,
	easeIn: Ease = EASE.out,
	easeOut: Ease = EASE.in,
): Key[] {
	return [
		[inStart, a, easeIn],
		[inEnd, b],
		[outStart, b, easeOut],
		[outEnd, a],
	];
}

/** A pop with overshoot: 0 → overshoot → 100. */
export function popScale(start: number, length = 14, overshoot = 112): Key[] {
	return [
		[start, [0, 0], EASE.out],
		[start + Math.round(length * 0.6), [overshoot, overshoot], EASE.inOut],
		[start + length, [100, 100]],
	];
}

/** Shifts every key by `offset` frames. */
export function delay(keys: Key[], offset: number): Key[] {
	return keys.map(([t, v, e]) => [t + offset, v, e] as Key);
}

/** A seamless loop of the given values evenly over `frames` (first value repeats at the end). */
export function cycle<T extends number | number[]>(
	values: T[],
	frames: number,
	ease: Ease = EASE.soft,
	start = 0,
): Key[] {
	const step = frames / values.length;
	const keys: Key[] = values.map((v, i) => [start + Math.round(step * i), v, ease]);
	keys.push([start + frames, values[0]]);
	return keys;
}

export type { LayerInput };
