import { hash01 } from "./random";
import { graphemes } from "./segment";
import type { Direction, Easing, UnitState } from "./types";

/**
 * Effect primitives: pure functions from (unit, progress, params) to a
 * partial unit state. Conventions:
 *   - In and out share one function. `p` is the eased progress where 1 is
 *     "at rest" (fully shown): in runs 0→1, out runs 1→0.
 *   - Emphasis gets `p` as the loop phase 0→1 and should be at rest (or
 *     close) at 0 and 1 so loops don't jump.
 *   - Lengths are in em; `opacity`, `scaleX`, `scaleY` multiply; every
 *     other number adds. Outputs are bounded for p in [0, 1].
 * Stage 2 content references effects by `id`; ids never change.
 */

export interface EffectContext {
	/** Unit index in reading order and the number of units. */
	index: number;
	count: number;
	/** Eased progress (1 = at rest); emphasis: loop phase. */
	p: number;
	/** Un-eased progress in the same sense. */
	raw: number;
	phase: "in" | "emphasis" | "out";
	direction: Direction;
	/** 0–2. */
	intensity: number;
	params: Record<string, number | string | boolean>;
	/** The unit's text. */
	text: string;
	/** Seconds from the clip start (for flicker/jitter that changes over time). */
	time: number;
	/** Frame-quantised time step for random effects (10 per second unless params.rate). */
	seed: number;
}

export type EffectFn = (ctx: EffectContext) => Partial<UnitState>;

export interface TextEffectDefinition {
	id: string;
	name: string;
	category: "basic" | "motion" | "reveal" | "stylise" | "loop" | "special";
	/** Phases the effect is designed for. */
	phases: Array<"in" | "emphasis" | "out">;
	defaults: { duration: number; stagger: number; direction: Direction; easing: Easing; unit?: "grapheme" | "word" | "line" | "block" };
	/** Effect-specific params with defaults (shown in Properties). */
	params?: Record<string, number | string | boolean>;
	/** Directions the effect reacts to (empty = none). */
	directions?: Direction[];
	fn: EffectFn;
}

const inv = (p: number) => 1 - p;
const k = (c: EffectContext) => c.intensity;
const num = (c: EffectContext, key: string, fallback: number) => {
	const v = c.params[key];
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};
const str = (c: EffectContext, key: string, fallback: string) => {
	const v = c.params[key];
	return typeof v === "string" && v ? v : fallback;
};
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Unit vector for a direction (screen y down). "in"/"out" have none. */
function vec(d: Direction): [number, number] {
	switch (d) {
		case "left":
			return [-1, 0];
		case "right":
			return [1, 0];
		case "up":
			return [0, -1];
		case "down":
			return [0, 1];
		default:
			return [0, 0];
	}
}

/** Travel offset: units come FROM the opposite side of `direction` (slide "up" rises from below). */
function travel(c: EffectContext, distance: number): Partial<UnitState> {
	const [dx, dy] = vec(c.direction);
	const away = inv(c.p) * distance * k(c);
	return { x: -dx * away, y: -dy * away };
}

function wipeSide(d: Direction): UnitState["clipSide"] {
	switch (d) {
		case "left":
			return "right";
		case "up":
			return "bottom";
		case "down":
			return "top";
		case "in":
		case "out":
			return "center";
		default:
			return "left";
	}
}

const SCRAMBLE_SETS: Record<string, string> = {
	latin: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*",
	sinhala: "අආඇඈඉඊඋඌඑඒඔකගචජටඩණතදනපබමයරලවසහළ",
	tamil: "அஆஇஈஉஊஎஏஐஒஓகஙசஞடணதநபமயரலவழளறன",
};

function scrambleText(c: EffectContext): string | undefined {
	if (c.p >= 1) return undefined;
	const chars = Array.from(c.text);
	const settled = Math.floor(chars.length * c.p);
	const set = /[඀-෿]/u.test(c.text) ? SCRAMBLE_SETS.sinhala : /[஀-௿]/u.test(c.text) ? SCRAMBLE_SETS.tamil : SCRAMBLE_SETS.latin;
	const pool = Array.from(set!);
	return chars
		.map((ch, i) => (i < settled || /\s/u.test(ch) ? ch : pool[Math.floor(hash01(c.seed, c.index, i, 31) * pool.length)]!))
		.join("");
}

function hueShift(hex: string, degrees: number): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex);
	if (!m) return hex;
	const n = Number.parseInt(m[1]!, 16);
	let r = ((n >> 16) & 255) / 255;
	let g = ((n >> 8) & 255) / 255;
	let b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
		h *= 60;
	} else {
		// Greys cycle through full-saturation hues.
		s = 0.85;
	}
	h = (((h + degrees) % 360) + 360) % 360;
	const c2 = (1 - Math.abs(2 * l - 1)) * s;
	const x = c2 * (1 - Math.abs(((h / 60) % 2) - 1));
	const m2 = l - c2 / 2;
	[r, g, b] = h < 60 ? [c2, x, 0] : h < 120 ? [x, c2, 0] : h < 180 ? [0, c2, x] : h < 240 ? [0, x, c2] : h < 300 ? [x, 0, c2] : [c2, 0, x];
	const to = (v: number) => Math.round(clamp01(v + m2) * 255).toString(16).padStart(2, "0");
	return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

const formatNumber = (value: number, decimals: number, separator: boolean) => {
	const fixed = value.toFixed(decimals);
	if (!separator) return fixed;
	const [int, frac] = fixed.split(".");
	return int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
};

const D = (duration: number, stagger: number, direction: Direction, easing: Easing, unit?: TextEffectDefinition["defaults"]["unit"]) => ({
	duration,
	stagger,
	direction,
	easing,
	...(unit ? { unit } : {}),
});

const ALL = ["in", "out"] as Array<"in" | "out">;
const LOOP = ["emphasis"] as Array<"emphasis">;
const ANY = ["in", "emphasis", "out"] as Array<"in" | "emphasis" | "out">;
const DIRS4: Direction[] = ["left", "right", "up", "down"];

export const TEXT_EFFECTS: TextEffectDefinition[] = [
	{ id: "fade", name: "Fade", category: "basic", phases: ALL, defaults: D(0.5, 0.04, "up", "ease-out"), fn: (c) => ({ opacity: c.p }) },
	{
		id: "slide",
		name: "Slide",
		category: "motion",
		phases: ALL,
		directions: DIRS4,
		defaults: D(0.6, 0.05, "left", "ease-out-cubic"),
		params: { distance: 1.2 },
		fn: (c) => ({ opacity: clamp01(c.p * 1.5), ...travel(c, num(c, "distance", 1.2)) }),
	},
	{ id: "rise", name: "Rise", category: "motion", phases: ALL, defaults: D(0.6, 0.05, "up", "ease-out-cubic"), fn: (c) => ({ opacity: c.p, y: inv(c.p) * 0.8 * k(c) }) },
	{ id: "drop", name: "Drop", category: "motion", phases: ALL, defaults: D(0.7, 0.05, "down", "ease-out-bounce"), fn: (c) => ({ opacity: clamp01(c.raw * 3), y: -inv(c.p) * 1.4 * k(c) }) },
	{
		id: "pop",
		name: "Pop",
		category: "basic",
		phases: ALL,
		defaults: D(0.45, 0.04, "in", "ease-out-back"),
		fn: (c) => {
			const s = Math.max(0, c.p);
			return { opacity: clamp01(c.raw * 2.5), scaleX: s, scaleY: s };
		},
	},
	{ id: "scale-up", name: "Scale up", category: "basic", phases: ALL, defaults: D(0.5, 0.04, "in", "ease-out-cubic"), fn: (c) => { const s = 1 - inv(c.p) * 0.7 * Math.min(1, k(c)); return { opacity: c.p, scaleX: s, scaleY: s }; } },
	{ id: "scale-down", name: "Scale down", category: "basic", phases: ALL, defaults: D(0.5, 0.04, "out", "ease-out-cubic"), fn: (c) => { const s = 1 + inv(c.p) * 1.5 * k(c); return { opacity: c.p, scaleX: s, scaleY: s }; } },
	{ id: "zoom-blur", name: "Zoom blur", category: "stylise", phases: ALL, defaults: D(0.6, 0.03, "out", "ease-out-expo"), fn: (c) => { const s = 1 + inv(c.p) * 2 * k(c); return { opacity: c.p, scaleX: s, scaleY: s, blur: inv(c.p) * 0.4 * k(c) }; } },
	{ id: "blur-in", name: "Blur", category: "stylise", phases: ALL, defaults: D(0.7, 0.04, "in", "ease-out"), fn: (c) => ({ opacity: c.p, blur: inv(c.p) * 0.35 * k(c) }) },
	{
		id: "typewriter",
		name: "Typewriter",
		category: "reveal",
		phases: ALL,
		defaults: D(0.06, 0.06, "right", "linear", "grapheme"),
		params: { caret: true },
		fn: (c) => {
			// One cluster appears whole; inside a word/line/block, clusters appear one by one.
			const single = graphemes(c.text).length <= 1;
			const reveal = single ? (c.raw > 0 ? 1 : 0) : c.raw;
			return { opacity: reveal > 0 ? 1 : 0, reveal, caret: c.params.caret !== false && c.raw > 0 && c.raw < 1 };
		},
	},
	{
		id: "scramble",
		name: "Scramble / decode",
		category: "special",
		phases: ALL,
		defaults: D(0.8, 0.03, "right", "linear"),
		params: { rate: 14 },
		fn: (c) => ({ opacity: clamp01(c.raw * 4), text: scrambleText(c) }),
	},
	{
		id: "wave",
		name: "Wave",
		category: "loop",
		phases: ANY,
		defaults: D(1.2, 0.08, "up", "linear", "grapheme"),
		params: { height: 0.25 },
		fn: (c) => {
			if (c.phase === "emphasis") return { y: -Math.sin(c.p * Math.PI * 2) * num(c, "height", 0.25) * k(c) };
			return { opacity: c.p, y: Math.sin(inv(c.p) * Math.PI) * -0.5 * k(c) + inv(c.p) * 0.6 };
		},
	},
	{
		id: "bounce",
		name: "Bounce",
		category: "motion",
		phases: ANY,
		defaults: D(0.8, 0.05, "down", "ease-out-bounce"),
		fn: (c) => (c.phase === "emphasis" ? { y: -Math.abs(Math.sin(c.p * Math.PI)) * 0.35 * k(c) } : { opacity: clamp01(c.raw * 3), y: -inv(c.p) * 1.2 * k(c) }),
	},
	{
		id: "elastic",
		name: "Elastic",
		category: "motion",
		phases: ALL,
		directions: DIRS4,
		defaults: D(0.9, 0.05, "left", "ease-out-elastic"),
		fn: (c) => ({ opacity: clamp01(c.raw * 3), ...travel(c, 1.2) }),
	},
	{ id: "flip-x", name: "Flip X", category: "motion", phases: ALL, defaults: D(0.6, 0.05, "up", "ease-out-back"), fn: (c) => ({ opacity: clamp01(c.raw * 2), scaleY: Math.cos(inv(c.p) * Math.PI * 0.5) }) },
	{ id: "flip-y", name: "Flip Y", category: "motion", phases: ALL, defaults: D(0.6, 0.05, "left", "ease-out-back"), fn: (c) => ({ opacity: clamp01(c.raw * 2), scaleX: Math.cos(inv(c.p) * Math.PI * 0.5) }) },
	{
		id: "rotate-in",
		name: "Rotate",
		category: "motion",
		phases: ALL,
		defaults: D(0.6, 0.05, "right", "ease-out-back"),
		params: { angle: 90 },
		fn: (c) => ({ opacity: c.p, rotation: (c.direction === "left" ? 1 : -1) * inv(c.p) * num(c, "angle", 90) * Math.min(1.5, k(c)) }),
	},
	{ id: "skew-in", name: "Skew", category: "motion", phases: ALL, directions: ["left", "right"], defaults: D(0.5, 0.04, "right", "ease-out-cubic"), fn: (c) => ({ opacity: c.p, skewX: (c.direction === "left" ? -1 : 1) * inv(c.p) * 40 * Math.min(1.5, k(c)), x: (c.direction === "left" ? 1 : -1) * inv(c.p) * 0.8 }) },
	{
		id: "glitch",
		name: "Glitch",
		category: "stylise",
		phases: ANY,
		defaults: D(0.6, 0.02, "right", "linear"),
		params: { rate: 18 },
		fn: (c) => {
			const amount = c.phase === "emphasis" ? (hash01(c.seed, 3) > 0.7 ? 1 : 0) : inv(c.p);
			const jx = (hash01(c.seed, c.index, 1) - 0.5) * 0.4 * amount * k(c);
			const jy = (hash01(c.seed, c.index, 2) - 0.5) * 0.15 * amount * k(c);
			const on = c.phase === "emphasis" || hash01(c.seed, c.index, 9) < 0.35 + c.p * 0.65;
			return { opacity: on ? 1 : 0.15, x: jx, y: jy, rgbSplit: 0.08 * amount * k(c), skewX: (hash01(c.seed, c.index, 4) - 0.5) * 20 * amount };
		},
	},
	{
		id: "rgb-split",
		name: "RGB split",
		category: "stylise",
		phases: ANY,
		defaults: D(0.6, 0.03, "right", "ease-out"),
		fn: (c) => (c.phase === "emphasis" ? { rgbSplit: Math.abs(Math.sin(c.p * Math.PI * 2)) * 0.06 * k(c) } : { opacity: c.p, rgbSplit: inv(c.p) * 0.15 * k(c) }),
	},
	{
		id: "neon-flicker",
		name: "Neon flicker",
		category: "stylise",
		phases: ANY,
		defaults: D(1, 0.08, "in", "linear"),
		params: { color: "#2EC4FF", rate: 20 },
		fn: (c) => {
			const flick = c.phase === "emphasis" ? (hash01(c.seed, c.index) > 0.9 ? 0.35 : 1) : c.p >= 1 ? 1 : hash01(c.seed, c.index) < c.p ? 1 : 0.1;
			return { opacity: flick, glow: { color: str(c, "color", "#2EC4FF"), size: 0.35 * flick * k(c) } };
		},
	},
	{
		id: "mask-wipe",
		name: "Mask wipe",
		category: "reveal",
		phases: ALL,
		directions: ["left", "right", "up", "down", "in"],
		defaults: D(0.6, 0.05, "right", "ease-in-out-cubic"),
		fn: (c) => ({ clip: c.p, clipSide: wipeSide(c.direction) }),
	},
	{
		id: "split-reveal",
		name: "Split reveal",
		category: "reveal",
		phases: ALL,
		defaults: D(0.7, 0.06, "up", "ease-out-expo", "line"),
		fn: (c) => ({ clip: 1, clipSide: "bottom", y: inv(c.p) * 1.1, opacity: c.p > 0 ? 1 : 0 }),
	},
	{ id: "tracking-expand", name: "Tracking expand", category: "stylise", phases: ALL, defaults: D(1, 0, "out", "ease-out-cubic", "grapheme"), fn: (c) => ({ opacity: c.p, tracking: inv(c.p) * (c.direction === "in" ? -0.3 : 0.6) * k(c) }) },
	{
		id: "highlight-sweep",
		name: "Highlight sweep",
		category: "reveal",
		phases: ANY,
		defaults: D(0.6, 0.1, "right", "ease-in-out", "word"),
		params: { color: "#FFD400" },
		fn: (c) => ({ highlight: { color: str(c, "color", "#FFD400"), amount: c.phase === "emphasis" ? (Math.sin(c.p * Math.PI * 2) + 1) / 2 : c.p } }),
	},
	{
		id: "underline-draw",
		name: "Underline draw",
		category: "reveal",
		phases: ALL,
		defaults: D(0.6, 0.1, "right", "ease-in-out-cubic", "word"),
		params: { color: "#FFFFFF" },
		fn: (c) => ({ underline: { color: str(c, "color", "#FFFFFF"), amount: c.p } }),
	},
	{
		id: "box-reveal",
		name: "Box reveal",
		category: "reveal",
		phases: ALL,
		defaults: D(0.8, 0.1, "right", "ease-in-out-cubic", "line"),
		params: { color: "#FFFFFF" },
		fn: (c) => ({ box: { color: str(c, "color", "#FFFFFF"), amount: clamp01(c.p * 2) }, clip: clamp01(c.p * 2 - 1), clipSide: "left" }),
	},
	{
		id: "stamp",
		name: "Stamp",
		category: "motion",
		phases: ALL,
		defaults: D(0.35, 0.08, "in", "ease-in-cubic", "word"),
		fn: (c) => {
			const s = 1 + inv(c.p) * 2.2 * k(c);
			return { opacity: clamp01(c.p * 1.4), scaleX: s, scaleY: s, rotation: inv(c.p) * -8 };
		},
	},
	{
		id: "shake",
		name: "Shake",
		category: "loop",
		phases: ANY,
		defaults: D(0.5, 0, "right", "linear", "block"),
		fn: (c) => {
			const amp = (c.phase === "emphasis" ? 1 : inv(c.p)) * 0.08 * k(c);
			return { opacity: c.phase === "emphasis" ? 1 : clamp01(c.raw * 4), x: Math.sin(c.p * Math.PI * 12) * amp };
		},
	},
	{
		id: "jitter",
		name: "Jitter",
		category: "loop",
		phases: ANY,
		defaults: D(1, 0, "right", "linear", "grapheme"),
		params: { rate: 12 },
		fn: (c) => {
			const amp = (c.phase === "emphasis" ? 1 : inv(c.p)) * 0.05 * k(c);
			return { opacity: c.phase === "emphasis" ? 1 : c.p, x: (hash01(c.seed, c.index, 5) - 0.5) * 2 * amp, y: (hash01(c.seed, c.index, 6) - 0.5) * 2 * amp, rotation: (hash01(c.seed, c.index, 7) - 0.5) * 8 * amp * 10 };
		},
	},
	{
		id: "swing",
		name: "Swing",
		category: "loop",
		phases: ANY,
		defaults: D(1.2, 0.06, "down", "ease-out-elastic"),
		fn: (c) => (c.phase === "emphasis" ? { rotation: Math.sin(c.p * Math.PI * 2) * 8 * k(c) } : { opacity: clamp01(c.raw * 3), rotation: inv(c.p) * 50 * k(c), y: -inv(c.p) * 0.2 }),
	},
	{
		id: "colour-cycle",
		name: "Colour cycle",
		category: "loop",
		phases: ANY,
		defaults: D(2, 0.05, "right", "linear"),
		params: { color: "#FF3B6B" },
		fn: (c) => ({ fill: hueShift(str(c, "color", "#FF3B6B"), (c.phase === "emphasis" ? c.p : inv(c.p)) * 360 * Math.min(1, k(c)) + c.index * 12) }),
	},
	{
		id: "gradient-sweep",
		name: "Gradient sweep",
		category: "loop",
		phases: ANY,
		defaults: D(2, 0, "right", "linear", "block"),
		params: { from: "#FF3B6B", to: "#2EC4FF" },
		fn: (c) => ({ opacity: c.phase === "in" ? c.p : 1, gradientShift: { colors: [str(c, "from", "#FF3B6B"), str(c, "to", "#2EC4FF"), str(c, "from", "#FF3B6B")], offset: c.phase === "emphasis" ? c.p : c.p * 0.5 } }),
	},
	{ id: "stroke-draw", name: "Stroke draw", category: "reveal", phases: ALL, defaults: D(1.2, 0.08, "right", "ease-in-out"), params: { color: "#FFFFFF" }, fn: (c) => ({ strokeDraw: c.p, stroke: str(c, "color", "#FFFFFF") }) },
	{
		id: "3d-tilt",
		name: "3D tilt",
		category: "motion",
		phases: ANY,
		defaults: D(0.8, 0.05, "up", "ease-out-cubic"),
		fn: (c) => {
			const a = c.phase === "emphasis" ? Math.sin(c.p * Math.PI * 2) * 0.35 : inv(c.p) * 1.2;
			// Perspective approximated with foreshortening + skew (Canvas 2D has no 3D).
			const vertical = c.direction === "up" || c.direction === "down";
			return { opacity: c.phase === "emphasis" ? 1 : c.p, ...(vertical ? { scaleY: Math.cos(Math.min(1.45, a * k(c))), skewX: Math.sin(a) * 12 } : { scaleX: Math.cos(Math.min(1.45, a * k(c))), skewY: Math.sin(a) * 12 }) };
		},
	},
	{
		id: "stretch",
		name: "Stretch",
		category: "motion",
		phases: ANY,
		defaults: D(0.7, 0.05, "up", "ease-out-back"),
		fn: (c) => {
			if (c.phase === "emphasis") {
				const s = Math.sin(c.p * Math.PI * 2) * 0.12 * k(c);
				return { scaleX: 1 - s, scaleY: 1 + s };
			}
			return { opacity: clamp01(c.raw * 2), scaleX: 1 - inv(c.p) * 0.6, scaleY: 1 + inv(c.p) * 1.5 * k(c) };
		},
	},
	{
		id: "karaoke-fill",
		name: "Karaoke fill",
		category: "reveal",
		phases: ["in", "emphasis"],
		defaults: D(0.4, 0.4, "right", "linear", "word"),
		params: { color: "#FFD400" },
		fn: (c) => ({ fillSweep: { color: str(c, "color", "#FFD400"), amount: c.phase === "emphasis" ? c.p : c.raw } }),
	},
	{
		id: "number-counter",
		name: "Number counter",
		category: "special",
		phases: ["in"],
		defaults: D(1.5, 0, "up", "ease-out-cubic", "word"),
		params: { from: 0, decimals: -1, separator: true },
		fn: (c) => {
			const m = /-?[\d,]*\.?\d+/.exec(c.text);
			if (!m) return { opacity: c.p };
			const target = Number(m[0].replace(/,/g, ""));
			const declared = num(c, "decimals", -1);
			const decimals = declared >= 0 ? declared : (m[0].split(".")[1]?.length ?? 0);
			const value = num(c, "from", 0) + (target - num(c, "from", 0)) * clamp01(c.p);
			const shown = formatNumber(value, decimals, c.params.separator !== false && m[0].includes(","));
			return { text: c.text.slice(0, m.index) + shown + c.text.slice(m.index + m[0].length) };
		},
	},
	{ id: "shine", name: "Shine", category: "loop", phases: ANY, defaults: D(1.2, 0, "right", "ease-in-out", "block"), fn: (c) => ({ opacity: c.phase === "in" ? clamp01(c.raw * 3) : 1, shine: c.phase === "out" ? inv(c.p) : c.p }) },
	{
		id: "pulse",
		name: "Pulse",
		category: "loop",
		phases: ANY,
		defaults: D(1, 0.05, "in", "ease-in-out"),
		fn: (c) => {
			const s = c.phase === "emphasis" ? 1 + Math.sin(c.p * Math.PI * 2) * 0.08 * k(c) : 1 + Math.sin(c.p * Math.PI) * 0.25 * k(c);
			return { opacity: c.phase === "emphasis" ? 1 : c.p, scaleX: s, scaleY: s };
		},
	},
	{
		id: "float",
		name: "Float",
		category: "loop",
		phases: ANY,
		defaults: D(2.4, 0.15, "up", "ease-in-out"),
		fn: (c) => (c.phase === "emphasis" ? { y: Math.sin(c.p * Math.PI * 2) * 0.1 * k(c), rotation: Math.sin(c.p * Math.PI * 2 + 1) * 2 * k(c) } : { opacity: c.p, y: inv(c.p) * 0.4 * k(c) }),
	},
	{ id: "spin", name: "Spin", category: "motion", phases: ANY, defaults: D(0.8, 0.05, "right", "ease-out-cubic"), fn: (c) => (c.phase === "emphasis" ? { rotation: c.p * 360 } : { opacity: c.p, rotation: inv(c.p) * 360 * (c.direction === "left" ? -1 : 1) }) },
	{ id: "blink", name: "Blink", category: "loop", phases: LOOP, defaults: D(1, 0, "in", "step", "block"), fn: (c) => ({ opacity: c.p < 0.5 ? 1 : 0.2 }) },
];

export const TEXT_EFFECT_IDS = TEXT_EFFECTS.map((e) => e.id);

const byId = new Map(TEXT_EFFECTS.map((e) => [e.id, e]));

export function getTextEffect(id: string | undefined): TextEffectDefinition | null {
	if (!id || id === "none") return null;
	return byId.get(id) ?? null;
}

/** For Stage 2 code-defined additions; content JSON should only reference ids. */
export function registerTextEffect(effect: TextEffectDefinition) {
	if (byId.has(effect.id)) throw new Error(`Text effect "${effect.id}" already exists`);
	TEXT_EFFECTS.push(effect);
	byId.set(effect.id, effect);
}
