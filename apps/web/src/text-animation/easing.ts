import type { Easing, NamedEasing } from "./types";

/** Cubic-bezier timing function (CSS semantics), solved by Newton + bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
	const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
	const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
	return (x: number) => {
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		let t = x;
		for (let i = 0; i < 8; i++) {
			const err = sampleX(t) - x;
			if (Math.abs(err) < 1e-6) return sampleY(t);
			const d = slopeX(t);
			if (Math.abs(d) < 1e-6) break;
			t -= err / d;
		}
		let lo = 0;
		let hi = 1;
		t = x;
		for (let i = 0; i < 30; i++) {
			const v = sampleX(t);
			if (Math.abs(v - x) < 1e-6) break;
			if (v < x) lo = t;
			else hi = t;
			t = (lo + hi) / 2;
		}
		return sampleY(t);
	};
}

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

function outBounce(t: number): number {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (t < 1 / d1) return n1 * t * t;
	if (t < 2 / d1) return n1 * (t - 1.5 / d1) ** 2 + 0.75;
	if (t < 2.5 / d1) return n1 * (t - 2.25 / d1) ** 2 + 0.9375;
	return n1 * (t - 2.625 / d1) ** 2 + 0.984375;
}

export const NAMED_EASINGS: Record<NamedEasing, (t: number) => number> = {
	linear: (t) => t,
	ease: cubicBezier(0.25, 0.1, 0.25, 1),
	"ease-in": cubicBezier(0.42, 0, 1, 1),
	"ease-out": cubicBezier(0, 0, 0.58, 1),
	"ease-in-out": cubicBezier(0.42, 0, 0.58, 1),
	"ease-in-quad": (t) => t * t,
	"ease-out-quad": (t) => 1 - (1 - t) ** 2,
	"ease-in-out-quad": (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
	"ease-in-cubic": (t) => t ** 3,
	"ease-out-cubic": (t) => 1 - (1 - t) ** 3,
	"ease-in-out-cubic": (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
	"ease-in-quart": (t) => t ** 4,
	"ease-out-quart": (t) => 1 - (1 - t) ** 4,
	"ease-in-expo": (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
	"ease-out-expo": (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
	"ease-in-out-expo": (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
	"ease-in-back": (t) => c3 * t ** 3 - c1 * t * t,
	"ease-out-back": (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
	"ease-in-out-back": (t) =>
		t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
	"ease-out-elastic": (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
	"ease-out-bounce": outBounce,
	step: (t) => (t < 1 ? 0 : 1),
};

export const EASING_NAMES = Object.keys(NAMED_EASINGS) as NamedEasing[];

const bezierCache = new Map<string, (t: number) => number>();

/** The easing function for a named or cubic-bezier easing; unknown names are linear. */
export function easingFunction(easing: Easing | undefined): (t: number) => number {
	if (!easing) return NAMED_EASINGS["ease-out-cubic"];
	if (Array.isArray(easing)) {
		const key = easing.join(",");
		let fn = bezierCache.get(key);
		if (!fn) {
			const [x1, y1, x2, y2] = easing;
			fn = cubicBezier(clamp01(x1), y1, clamp01(x2), y2);
			bezierCache.set(key, fn);
		}
		return fn;
	}
	return NAMED_EASINGS[easing] ?? NAMED_EASINGS.linear;
}

export function applyEasing(easing: Easing | undefined, t: number): number {
	return easingFunction(easing)(clamp01(t));
}

/** Cubic-bezier numbers for a named easing where one exists (for the curve editor and Lottie). */
export const EASING_BEZIERS: Partial<Record<NamedEasing, [number, number, number, number]>> = {
	linear: [0, 0, 1, 1],
	ease: [0.25, 0.1, 0.25, 1],
	"ease-in": [0.42, 0, 1, 1],
	"ease-out": [0, 0, 0.58, 1],
	"ease-in-out": [0.42, 0, 0.58, 1],
	"ease-in-quad": [0.11, 0, 0.5, 0],
	"ease-out-quad": [0.5, 1, 0.89, 1],
	"ease-in-out-quad": [0.45, 0, 0.55, 1],
	"ease-in-cubic": [0.32, 0, 0.67, 0],
	"ease-out-cubic": [0.33, 1, 0.68, 1],
	"ease-in-out-cubic": [0.65, 0, 0.35, 1],
	"ease-in-quart": [0.5, 0, 0.75, 0],
	"ease-out-quart": [0.25, 1, 0.5, 1],
	"ease-in-expo": [0.7, 0, 0.84, 0],
	"ease-out-expo": [0.16, 1, 0.3, 1],
	"ease-in-out-expo": [0.87, 0, 0.13, 1],
	"ease-in-back": [0.36, 0, 0.66, -0.56],
	"ease-out-back": [0.34, 1.56, 0.64, 1],
	"ease-in-out-back": [0.68, -0.6, 0.32, 1.6],
};

export function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}
