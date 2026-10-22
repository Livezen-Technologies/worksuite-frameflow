export type TransitionType =
	| "cross-dissolve"
	| "dip-to-black"
	| "blur-dissolve"
	| "slide"
	| "push"
	| "wipe"
	| "split"
	| "circle"
	| "iris-diamond"
	| "zoom-in"
	| "zoom-out"
	| "spin"
	| "whip-pan";

export type TransitionCategory =
	| "Basic"
	| "Slide"
	| "Wipe"
	| "Shape"
	| "Zoom"
	| "Motion";

export type TransitionDirection = "left" | "right" | "up" | "down";
export type TransitionEasing =
	| "linear"
	| "ease-in"
	| "ease-out"
	| "ease-in-out";
/** Where the transition sits relative to the cut (WS-18). */
export type TransitionAlignment = "center" | "start" | "end";

/** Stored on the clip after a cut: how the cut into this clip is animated. */
export interface ClipTransition {
	type: TransitionType;
	/** Seconds. */
	duration: number;
	easing: TransitionEasing;
	direction: TransitionDirection;
	alignment: TransitionAlignment;
}

export const DEFAULT_TRANSITION: Omit<ClipTransition, "type"> = {
	duration: 0.8,
	easing: "ease-in-out",
	direction: "left",
	alignment: "center",
};
