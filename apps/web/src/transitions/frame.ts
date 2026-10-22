import type {
	TransitionDirection,
	TransitionEasing,
	TransitionType,
} from "./types";

/** What a transition does to one clip at one moment. */
export interface TransitionFrame {
	/** Multiplies the clip's opacity. */
	opacity: number;
	/** Offset as a fraction of the canvas (1 = one full width/height). */
	offsetX: number;
	offsetY: number;
	/** Multiplies the clip's scale. */
	scale: number;
	/** Degrees added to the clip's rotation. */
	rotate: number;
	/** Gaussian blur intensity, 0–100 (same scale as the Blur effect). */
	blur: number;
	/** A reveal mask in the clip's own space (fractions of its size), or none. */
	mask: TransitionMask | null;
}

export type TransitionMask =
	| {
			shape: "rectangle";
			centerX: number;
			centerY: number;
			width: number;
			height: number;
	  }
	| { shape: "ellipse" | "diamond"; width: number; height: number };

export const IDENTITY_FRAME: TransitionFrame = {
	opacity: 1,
	offsetX: 0,
	offsetY: 0,
	scale: 1,
	rotate: 0,
	blur: 0,
	mask: null,
};

export function ease({
	easing,
	t,
}: {
	easing: TransitionEasing;
	t: number;
}): number {
	const x = Math.min(1, Math.max(0, t));
	switch (easing) {
		case "linear":
			return x;
		case "ease-in":
			return x * x * x;
		case "ease-out":
			return 1 - (1 - x) ** 3;
		case "ease-in-out":
			return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
	}
}

/** Unit vector the incoming clip travels along (it enters from the opposite side). */
function travel(direction: TransitionDirection): { x: number; y: number } {
	switch (direction) {
		case "left":
			return { x: -1, y: 0 };
		case "right":
			return { x: 1, y: 0 };
		case "up":
			return { x: 0, y: -1 };
		case "down":
			return { x: 0, y: 1 };
	}
}

/** Mask bigger than the frame by this much, so reveal edges never show at 100%. */
const OVERSCAN = 1.02;

/**
 * The state of the outgoing ("out") or incoming ("in") clip at `progress`
 * 0…1 through a transition. The incoming clip draws above the outgoing one.
 * `aspect` = clip width / height, used to keep circles round.
 */
export function transitionFrame({
	type,
	role,
	progress,
	direction,
	aspect = 16 / 9,
}: {
	type: TransitionType;
	role: "in" | "out";
	progress: number;
	direction: TransitionDirection;
	aspect?: number;
}): TransitionFrame {
	const p = Math.min(1, Math.max(0, progress));
	const v = travel(direction);
	const frame = { ...IDENTITY_FRAME };
	const isIn = role === "in";

	switch (type) {
		case "cross-dissolve":
			if (isIn) frame.opacity = p;
			return frame;
		case "dip-to-black":
			frame.opacity = isIn ? Math.max(0, 2 * p - 1) : Math.max(0, 1 - 2 * p);
			return frame;
		case "blur-dissolve": {
			const peak = 1 - Math.abs(2 * p - 1);
			frame.blur = 40 * peak;
			if (isIn) frame.opacity = p;
			return frame;
		}
		case "slide":
			if (isIn) {
				frame.offsetX = -v.x * (1 - p);
				frame.offsetY = -v.y * (1 - p);
			}
			return frame;
		case "push":
		case "whip-pan": {
			const shift = isIn ? 1 - p : -p;
			frame.offsetX = -v.x * shift;
			frame.offsetY = -v.y * shift;
			if (type === "whip-pan") frame.blur = 60 * (1 - Math.abs(2 * p - 1));
			return frame;
		}
		case "wipe": {
			if (!isIn) return frame;
			const size = p * OVERSCAN;
			// The reveal starts on the side the motion comes from.
			if (v.x !== 0) {
				const edge = v.x > 0 ? -0.5 : 0.5;
				frame.mask = {
					shape: "rectangle",
					centerX: edge + (v.x * size) / 2,
					centerY: 0,
					width: size,
					height: OVERSCAN,
				};
			} else {
				const edge = v.y > 0 ? -0.5 : 0.5;
				frame.mask = {
					shape: "rectangle",
					centerX: 0,
					centerY: edge + (v.y * size) / 2,
					width: OVERSCAN,
					height: size,
				};
			}
			return frame;
		}
		case "split": {
			if (!isIn) return frame;
			const size = p * OVERSCAN;
			frame.mask =
				v.x !== 0
					? {
							shape: "rectangle",
							centerX: 0,
							centerY: 0,
							width: size,
							height: OVERSCAN,
						}
					: {
							shape: "rectangle",
							centerX: 0,
							centerY: 0,
							width: OVERSCAN,
							height: size,
						};
			return frame;
		}
		case "circle": {
			if (!isIn) return frame;
			// Radius that covers the corners: half the diagonal, in clip widths.
			const diameterInWidths = Math.hypot(1, 1 / aspect) * OVERSCAN * p;
			frame.mask = {
				shape: "ellipse",
				width: diameterInWidths,
				height: diameterInWidths * aspect,
			};
			return frame;
		}
		case "iris-diamond": {
			if (!isIn) return frame;
			// A diamond reaches the corners at twice the frame size.
			frame.mask = {
				shape: "diamond",
				width: 2 * OVERSCAN * p,
				height: 2 * OVERSCAN * p,
			};
			return frame;
		}
		case "zoom-in":
			if (isIn) {
				frame.scale = 1.4 - 0.4 * p;
				frame.opacity = p;
			} else {
				frame.scale = 1 + 0.3 * p;
			}
			return frame;
		case "zoom-out":
			if (isIn) {
				frame.scale = 0.6 + 0.4 * p;
				frame.opacity = p;
			} else {
				frame.scale = 1 - 0.3 * p;
			}
			return frame;
		case "spin":
			if (isIn) {
				frame.rotate = -180 * (1 - p);
				frame.scale = 0.2 + 0.8 * p;
				frame.opacity = Math.min(1, p * 2);
			}
			return frame;
	}
}
