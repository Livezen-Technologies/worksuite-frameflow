import type { ParamDefinition, ParamValues } from "@/params";
import type { TransitionMask } from "@/transitions/frame";

/**
 * In, Out and Combo animations for clips and text (the Animation panel).
 * In plays from the start, Out into the end, Combo loops over the whole clip.
 * Offsets are in "travel" units: the caller scales them (font size for text,
 * the frame for clips).
 */
export interface AnimationPreset {
	value: string;
	label: string;
	/** Only for text (typewriter needs letters). */
	textOnly?: boolean;
	/** Only for video and picture clips (masks and blur aren't drawn on text). */
	clipOnly?: boolean;
	/** Gallery group (Slide, Zoom & spin, …); hand-made presets are "Classic". */
	group?: string;
}

/*
 * Generated presets. Each is a recipe in its value, so it renders the same
 * in the preview, the editor and the export without a lookup table:
 *   g:<dx>:<dy>:<scale>:<rotate>:<ease>   edge (In/Out) motion
 *   l:<shape>:<amount>:<speed>           loop (Combo)
 * dx/dy are travel units, scale the starting size, rotate degrees.
 */
const DIRS: Array<[string, number, number]> = [
	["↑", 0, 1],
	["↓", 0, -1],
	["←", 1, 0],
	["→", -1, 0],
	["↖", 0.7, 0.7],
	["↗", -0.7, 0.7],
	["↙", 0.7, -0.7],
	["↘", -0.7, -0.7],
];
const DISTANCES: Array<[string, number]> = [["Short", 0.3], ["", 0.8], ["Far", 1.6]];
const EASES: Array<[string, string]> = [["smooth", ""], ["back", "Overshoot"], ["bounce", "Bounce"], ["elastic", "Elastic"]];
const ZOOMS: Array<[string, number]> = [["From tiny", 0.2], ["Grow", 0.6], ["Shrink", 1.4], ["From huge", 2.5]];
const TURNS: Array<[string, number]> = [["", 0], ["Tilt", 20], ["Tilt back", -20], ["Half turn", 180], ["Half turn back", -180], ["Full turn", 360], ["Full turn back", -360]];
const ROLLS: Array<[string, number]> = [["Roll", 20], ["Spin", 180], ["Whirl", 360]];

function edgePresets(entering: boolean): AnimationPreset[] {
	const verb = entering ? "In" : "Out";
	const list: AnimationPreset[] = [];
	for (const [arrow, dx, dy] of DIRS)
		for (const [distName, dist] of DISTANCES)
			for (const [ease, easeName] of EASES)
				list.push({
					value: `g:${dx * dist}:${dy * dist}:1:0:${ease}`,
					label: [`Slide ${verb} ${arrow}`, distName, easeName].filter(Boolean).join(" · "),
					group: "Slide",
				});
	for (const [zoomName, scale] of ZOOMS)
		for (const [turnName, rotate] of TURNS)
			list.push({ value: `g:0:0:${scale}:${rotate}:${rotate ? "smooth" : "back"}`, label: [zoomName, turnName].filter(Boolean).join(" · "), group: "Zoom & spin" });
	for (const [arrow, dx, dy] of DIRS)
		for (const [rollName, rotate] of ROLLS)
			list.push({ value: `g:${dx * 0.8}:${dy * 0.8}:0.8:${rotate * (dx < 0 ? -1 : 1)}:smooth`, label: `${rollName} ${verb} ${arrow}`, group: "Roll" });
	return list;
}

const LOOPS: Array<[string, string]> = [
	["pulse", "Pulse"],
	["float", "Float"],
	["sway", "Sway"],
	["shake", "Shake"],
	["orbit", "Orbit"],
	["zigzag", "Zigzag"],
	["jelly", "Jelly"],
	["tilt", "Tilt"],
	["hop", "Hop"],
	["glow", "Fade pulse"],
];
const AMOUNTS: Array<[string, number]> = [["Soft", 0.5], ["", 1], ["Strong", 2]];
const SPEEDS: Array<[string, number]> = [["Slow", 0.5], ["", 1], ["Fast", 2]];

function loopPresets(): AnimationPreset[] {
	const list: AnimationPreset[] = [];
	for (const [shape, name] of LOOPS)
		for (const [amountName, amount] of AMOUNTS)
			for (const [speedName, speed] of SPEEDS)
				list.push({ value: `l:${shape}:${amount}:${speed}`, label: [name, amountName, speedName].filter(Boolean).join(" · "), group: "Loops" });
	return list;
}

export const IN_ANIMATIONS: AnimationPreset[] = [
	{ value: "none", label: "None" },
	{ value: "fade", label: "Fade In" },
	{ value: "slide-up", label: "Slide Up" },
	{ value: "slide-down", label: "Slide Down" },
	{ value: "slide-left", label: "Slide Left" },
	{ value: "slide-right", label: "Slide Right" },
	{ value: "zoom-in", label: "Zoom In" },
	{ value: "pop", label: "Pop" },
	{ value: "bounce", label: "Bounce" },
	{ value: "spin", label: "Spin In" },
	{ value: "drop", label: "Drop" },
	{ value: "typewriter", label: "Typewriter", textOnly: true },
	{ value: "blur", label: "Blur In", clipOnly: true },
	{ value: "zoom-blur", label: "Zoom Blur", clipOnly: true },
	{ value: "iris", label: "Crystal Ball", clipOnly: true },
	{ value: "diamond", label: "Diamond", clipOnly: true },
	{ value: "wipe-right", label: "Wipe Right", clipOnly: true },
	{ value: "wipe-left", label: "Wipe Left", clipOnly: true },
	{ value: "wipe-down", label: "Wipe Down", clipOnly: true },
	{ value: "wipe-up", label: "Wipe Up", clipOnly: true },
	{ value: "shutter", label: "Shutter Open", clipOnly: true },
	{ value: "curtain", label: "Curtain", clipOnly: true },
	{ value: "flip", label: "Flip" },
	{ value: "twist", label: "Twist" },
	{ value: "flash", label: "Flash Cuts" },
	{ value: "swing-in", label: "Swing In" },
	...edgePresets(true),
];

export const OUT_ANIMATIONS: AnimationPreset[] = [
	{ value: "none", label: "None" },
	{ value: "fade", label: "Fade Out" },
	{ value: "slide-down", label: "Slide Down" },
	{ value: "slide-up", label: "Slide Up" },
	{ value: "slide-left", label: "Slide Left" },
	{ value: "slide-right", label: "Slide Right" },
	{ value: "zoom-out", label: "Zoom Out" },
	{ value: "pop", label: "Shrink" },
	{ value: "spin", label: "Spin Out" },
	{ value: "blur", label: "Blur Out", clipOnly: true },
	{ value: "zoom-blur", label: "Zoom Blur", clipOnly: true },
	{ value: "iris", label: "Closing", clipOnly: true },
	{ value: "diamond", label: "Diamond", clipOnly: true },
	{ value: "wipe-right", label: "Wipe Right", clipOnly: true },
	{ value: "wipe-left", label: "Wipe Left", clipOnly: true },
	{ value: "wipe-down", label: "Wipe Down", clipOnly: true },
	{ value: "wipe-up", label: "Wipe Up", clipOnly: true },
	{ value: "shutter", label: "Shutter Close", clipOnly: true },
	{ value: "curtain", label: "Curtain", clipOnly: true },
	{ value: "flip", label: "Flip" },
	{ value: "twist", label: "Twist" },
	{ value: "flash", label: "Flash Cuts" },
	{ value: "drop", label: "Fall" },
	...edgePresets(false),
];

export const COMBO_ANIMATIONS: AnimationPreset[] = [
	{ value: "none", label: "None" },
	{ value: "pulse", label: "Pulse" },
	{ value: "float", label: "Float" },
	{ value: "wobble", label: "Wobble" },
	{ value: "ken-burns", label: "Slow Zoom" },
	{ value: "swing", label: "Swing" },
	{ value: "heartbeat", label: "Heartbeat" },
	{ value: "shake", label: "Shake" },
	{ value: "breathe", label: "Breathe" },
	{ value: "blink", label: "Blink" },
	{ value: "flicker", label: "Flicker" },
	{ value: "rock", label: "Rock" },
	{ value: "spin-loop", label: "Spin" },
	{ value: "bounce-loop", label: "Bounce" },
	{ value: "drift", label: "Drift" },
	{ value: "dream", label: "Dream Blur", clipOnly: true },
	{ value: "spotlight", label: "Spotlight", clipOnly: true },
	...loopPresets(),
];

/** Caption animations: the text appears word by word or line by line. */
export const CAPTION_ANIMATIONS: AnimationPreset[] = [
	{ value: "none", label: "None", textOnly: true },
	{ value: "words", label: "Word by word", textOnly: true },
	{ value: "words-fast", label: "Quick words", textOnly: true },
	{ value: "lines", label: "Line by line", textOnly: true },
	{ value: "letters", label: "Letter by letter", textOnly: true },
	// Uses the caption's word timings from transcription (AI-46).
	{ value: "highlight", label: "Highlight spoken word", textOnly: true },
	// Words appear as the voice says them (Text › Basic › Sync with voice).
	{ value: "voice", label: "Show with voice", textOnly: true },
];

const options = (presets: AnimationPreset[]) =>
	presets.map(({ value, label }) => ({ value, label }));

export const ANIMATION_PARAMS: ParamDefinition[] = [
	{
		key: "animation.in",
		label: "Animate In",
		type: "select",
		default: "none",
		options: options(IN_ANIMATIONS),
		keyframable: false,
	},
	{
		key: "animation.inDuration",
		label: "In Duration (s)",
		type: "number",
		default: 0.6,
		min: 0.1,
		max: 5,
		step: 0.1,
		keyframable: false,
	},
	{
		key: "animation.out",
		label: "Animate Out",
		type: "select",
		default: "none",
		options: options(OUT_ANIMATIONS),
		keyframable: false,
	},
	{
		key: "animation.outDuration",
		label: "Out Duration (s)",
		type: "number",
		default: 0.4,
		min: 0.1,
		max: 5,
		step: 0.1,
		keyframable: false,
	},
	{
		key: "animation.caption",
		label: "Caption",
		type: "select",
		default: "none",
		options: options(CAPTION_ANIMATIONS),
		keyframable: false,
	},
	{
		key: "animation.highlightColor",
		label: "Highlight Color",
		type: "color",
		default: "#ffd400",
		keyframable: false,
	},
	{
		key: "animation.combo",
		label: "Combo",
		type: "select",
		default: "none",
		options: options(COMBO_ANIMATIONS),
		keyframable: false,
	},
	{
		key: "animation.comboSpeed",
		label: "Combo Speed",
		type: "number",
		default: 1,
		min: 0.25,
		max: 4,
		step: 0.05,
		keyframable: false,
	},
];

export const ANIMATION_PARAM_KEYS = ANIMATION_PARAMS.map((p) => p.key);

export interface AnimationState {
	opacity: number;
	/** Travel units; positive is right / down. */
	offsetX: number;
	offsetY: number;
	scale: number;
	/** Degrees. */
	rotate: number;
	/** 0–1 share of text revealed by a typewriter, or 1. */
	reveal: number;
	/** Round the reveal to whole words or lines (caption animations). */
	revealUnit?: "word" | "line";
	/** Gaussian blur, 0–100 (clips only). */
	blur: number;
	/** A reveal mask in the clip's own space (clips only). */
	mask: TransitionMask | null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInCubic = (t: number) => t ** 3;
function easeOutBack(t: number) {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
function easeOutBounce(t: number) {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (t < 1 / d1) return n1 * t * t;
	if (t < 2 / d1) return n1 * (t - 1.5 / d1) ** 2 + 0.75;
	if (t < 2.5 / d1) return n1 * (t - 2.25 / d1) ** 2 + 0.9375;
	return n1 * (t - 2.625 / d1) ** 2 + 0.984375;
}

function easeOutElastic(t: number) {
	if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
	return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

const EASE_FN: Record<string, (t: number) => number> = {
	smooth: easeOutCubic,
	back: easeOutBack,
	bounce: easeOutBounce,
	elastic: easeOutElastic,
};

/** A generated edge recipe (g:dx:dy:scale:rotate:ease). */
function applyRecipe({ state, type, t, entering }: { state: AnimationState; type: string; t: number; entering: boolean }) {
	const [, dx, dy, scale, rotate, ease] = type.split(":");
	// Leaving mirrors entering: it starts settled and moves back out.
	const k = (entering ? (EASE_FN[ease] ?? easeOutCubic) : easeOutCubic)(t);
	const away = 1 - k;
	const s0 = Number(scale) || 1;
	state.opacity *= clamp01(t * 2.5);
	state.offsetX += (entering ? 1 : -1) * (Number(dx) || 0) * away;
	state.offsetY += (entering ? 1 : -1) * (Number(dy) || 0) * away;
	state.scale *= Math.max(0.01, s0 + (1 - s0) * k);
	state.rotate += (entering ? -1 : 1) * (Number(rotate) || 0) * away;
}

/** A generated loop recipe (l:shape:amount:speed). */
function applyLoop({ state, type, seconds, speed }: { state: AnimationState; type: string; seconds: number; speed: number }) {
	const [, shape, amountRaw, speedRaw] = type.split(":");
	const a = Number(amountRaw) || 1;
	const phase = seconds * speed * (Number(speedRaw) || 1) * Math.PI * 2;
	switch (shape) {
		case "pulse":
			state.scale *= 1 + 0.05 * a * Math.sin(phase);
			break;
		case "float":
			state.offsetY += 0.05 * a * Math.sin(phase * 0.5);
			break;
		case "sway":
			state.offsetX += 0.05 * a * Math.sin(phase * 0.5);
			break;
		case "shake":
			state.offsetX += 0.02 * a * Math.sin(phase * 3.1);
			state.offsetY += 0.015 * a * Math.sin(phase * 4.3 + 1);
			break;
		case "orbit":
			state.offsetX += 0.04 * a * Math.cos(phase * 0.5);
			state.offsetY += 0.04 * a * Math.sin(phase * 0.5);
			break;
		case "zigzag":
			state.offsetX += 0.04 * a * ((2 / Math.PI) * Math.asin(Math.sin(phase * 0.5)));
			state.offsetY += 0.02 * a * Math.sin(phase);
			break;
		case "jelly":
			state.scale *= 1 + 0.04 * a * Math.sin(phase) * Math.sin(phase * 0.5);
			state.rotate += 2 * a * Math.sin(phase * 1.5);
			break;
		case "tilt":
			state.rotate += 5 * a * Math.sin(phase * 0.5);
			break;
		case "hop":
			state.offsetY -= 0.05 * a * Math.abs(Math.sin(phase * 0.5));
			break;
		case "glow":
			state.opacity *= 1 - 0.2 * a * (0.5 + 0.5 * Math.sin(phase * 0.5));
			break;
	}
}

function num({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str({ params, key }: { params: ParamValues; key: string }): string {
	const value = params[key];
	return typeof value === "string" && value ? value : "none";
}

/** Applies one edge animation; `t` runs 0→1 as the clip becomes fully shown. */
function applyEdge({
	state,
	type,
	t,
	entering,
}: {
	state: AnimationState;
	type: string;
	t: number;
	entering: boolean;
}) {
	if (type.startsWith("g:")) {
		applyRecipe({ state, type, t, entering });
		return;
	}
	const eased = easeOutCubic(t);
	const away = 1 - eased;
	switch (type) {
		case "fade":
			state.opacity *= t;
			break;
		case "typewriter":
			state.reveal = t;
			break;
		case "slide-up":
			// In: rises from below. Out: leaves upwards.
			state.opacity *= eased;
			state.offsetY += (entering ? 1 : -1) * away * 0.8;
			break;
		case "slide-down":
			state.opacity *= eased;
			state.offsetY += (entering ? -1 : 1) * away * 0.8;
			break;
		case "slide-left":
			state.opacity *= eased;
			state.offsetX += (entering ? 1 : -1) * away * 0.8;
			break;
		case "slide-right":
			state.opacity *= eased;
			state.offsetX += (entering ? -1 : 1) * away * 0.8;
			break;
		case "zoom-in":
			state.opacity *= eased;
			state.scale *= 0.6 + 0.4 * eased;
			break;
		case "zoom-out":
			state.opacity *= eased;
			state.scale *= 1 + 0.5 * away;
			break;
		case "pop":
			state.opacity *= clamp01(t * 3);
			state.scale *= entering ? 0.4 + 0.6 * easeOutBack(t) : 0.4 + 0.6 * t;
			break;
		case "bounce":
			state.opacity *= clamp01(t * 4);
			state.offsetY -= (1 - easeOutBounce(t)) * 1.2;
			break;
		case "spin":
			state.opacity *= eased;
			state.scale *= 0.5 + 0.5 * eased;
			state.rotate += (entering ? -1 : 1) * away * 180;
			break;
		case "drop":
			state.opacity *= clamp01(t * 3);
			if (entering) {
				state.offsetY -= (1 - easeOutBounce(t)) * 0.9;
				state.scale *= 1 + 0.15 * (1 - easeInCubic(t));
			} else state.offsetY += away * 1.1;
			break;
		case "blur":
			state.opacity *= clamp01(t * 1.5);
			state.blur = Math.max(state.blur, away * 60);
			break;
		case "zoom-blur":
			state.opacity *= eased;
			state.scale *= entering ? 1 + 0.35 * away : 1 + 0.5 * away;
			state.blur = Math.max(state.blur, away * 45);
			break;
		case "iris": {
			const size = 1.5 * eased;
			state.mask = { shape: "ellipse", width: size, height: size };
			break;
		}
		case "diamond": {
			const size = 2.05 * eased;
			state.mask = { shape: "diamond", width: size, height: size };
			break;
		}
		case "wipe-right":
		case "wipe-left": {
			// In: the picture appears from the named side's opposite edge, moving that way.
			const toRight = (type === "wipe-right") === entering;
			const size = eased * 1.02;
			state.mask = {
				shape: "rectangle",
				centerX: toRight ? -0.51 + size / 2 : 0.51 - size / 2,
				centerY: 0,
				width: size,
				height: 1.02,
			};
			break;
		}
		case "wipe-down":
		case "wipe-up": {
			const toDown = (type === "wipe-down") === entering;
			const size = eased * 1.02;
			state.mask = {
				shape: "rectangle",
				centerX: 0,
				centerY: toDown ? -0.51 + size / 2 : 0.51 - size / 2,
				width: 1.02,
				height: size,
			};
			break;
		}
		case "shutter":
			state.mask = { shape: "rectangle", centerX: 0, centerY: 0, width: 1.02, height: eased * 1.02 };
			break;
		case "curtain":
			state.mask = { shape: "rectangle", centerX: 0, centerY: 0, width: eased * 1.02, height: 1.02 };
			break;
		case "flip":
			state.opacity *= clamp01(t * 2);
			state.scale *= Math.max(0.02, Math.abs(Math.cos((away * Math.PI) / 2)));
			break;
		case "twist":
			state.opacity *= eased;
			state.scale *= 0.3 + 0.7 * eased;
			state.rotate += (entering ? 1 : -1) * away * 360;
			break;
		case "flash": {
			// Hard on/off cuts that settle: dark frames flicker in before it holds.
			const step = Math.floor(t * 8);
			state.opacity *= t >= 0.85 || step % 2 === 1 ? 1 : 0.15;
			break;
		}
		case "swing-in":
			state.opacity *= eased;
			state.rotate += away * -25;
			state.offsetX -= away * 0.3;
			break;
	}
}

function applyCombo({
	state,
	type,
	seconds,
	progress,
	speed,
}: {
	state: AnimationState;
	type: string;
	seconds: number;
	progress: number;
	speed: number;
}) {
	if (type.startsWith("l:")) {
		applyLoop({ state, type, seconds, speed });
		return;
	}
	const phase = seconds * speed * Math.PI * 2;
	switch (type) {
		case "pulse":
			state.scale *= 1 + 0.06 * Math.sin(phase);
			break;
		case "float":
			state.offsetY += 0.06 * Math.sin(phase * 0.5);
			break;
		case "wobble":
			state.rotate += 4 * Math.sin(phase);
			break;
		case "ken-burns":
			state.scale *= 1 + 0.15 * progress;
			break;
		case "swing":
			state.rotate += 8 * Math.sin(phase * 0.5);
			state.offsetX += 0.03 * Math.sin(phase * 0.5);
			break;
		case "shake":
			state.offsetX += 0.025 * Math.sin(phase * 3.1);
			state.offsetY += 0.02 * Math.sin(phase * 4.3 + 1);
			break;
		case "breathe":
			state.scale *= 1 + 0.04 * Math.sin(phase * 0.5);
			state.opacity *= 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(phase * 0.5));
			break;
		case "blink":
			state.opacity *= (seconds * speed) % 1 < 0.75 ? 1 : 0;
			break;
		case "flicker": {
			const n = Math.sin(Math.floor(seconds * speed * 12) * 12.9898) * 43758.5453;
			state.opacity *= 0.55 + 0.45 * (n - Math.floor(n));
			break;
		}
		case "rock":
			state.rotate += 6 * Math.sin(phase);
			state.offsetY += 0.015 * Math.abs(Math.sin(phase));
			break;
		case "spin-loop":
			state.rotate += ((seconds * speed * 90) % 360);
			break;
		case "bounce-loop":
			state.offsetY -= 0.06 * Math.abs(Math.sin(phase * 0.75));
			break;
		case "drift":
			state.offsetX += 0.04 * Math.sin(phase * 0.25);
			state.scale *= 1.08;
			break;
		case "dream":
			state.blur = Math.max(state.blur, 12 + 10 * (0.5 + 0.5 * Math.sin(phase * 0.5)));
			state.opacity *= 0.9;
			break;
		case "spotlight": {
			const size = 0.95 + 0.12 * Math.sin(phase * 0.5);
			state.mask = { shape: "ellipse", width: size, height: size };
			break;
		}
		case "heartbeat": {
			const beat = (seconds * speed) % 1;
			const kick = beat < 0.15 ? Math.sin((beat / 0.15) * Math.PI) : 0;
			const kick2 =
				beat > 0.25 && beat < 0.4
					? Math.sin(((beat - 0.25) / 0.15) * Math.PI)
					: 0;
			state.scale *= 1 + 0.08 * kick + 0.05 * kick2;
			break;
		}
	}
}

/** The animation at `localSeconds` into a clip `durationSeconds` long. */
export function animationState({
	params,
	localSeconds,
	durationSeconds,
}: {
	params: ParamValues;
	localSeconds: number;
	durationSeconds: number;
}): AnimationState {
	const state: AnimationState = {
		opacity: 1,
		offsetX: 0,
		offsetY: 0,
		scale: 1,
		rotate: 0,
		reveal: 1,
		blur: 0,
		mask: null,
	};
	// Keep in and out from overlapping on short clips.
	const half = durationSeconds / 2;
	const inType = str({ params, key: "animation.in" });
	const outType = str({ params, key: "animation.out" });
	const combo = str({ params, key: "animation.combo" });
	const inDuration = Math.min(
		num({ params, key: "animation.inDuration", fallback: 0.6 }),
		half,
	);
	const outDuration = Math.min(
		num({ params, key: "animation.outDuration", fallback: 0.4 }),
		half,
	);

	if (combo !== "none") {
		applyCombo({
			state,
			type: combo,
			seconds: localSeconds,
			progress:
				durationSeconds > 0 ? clamp01(localSeconds / durationSeconds) : 0,
			speed: num({ params, key: "animation.comboSpeed", fallback: 1 }),
		});
	}
	const caption = str({ params, key: "animation.caption" });
	if (caption !== "none" && caption !== "highlight" && caption !== "voice" && durationSeconds > 0) {
		const span =
			caption === "words-fast" ? 0.4 : caption === "letters" ? 0.6 : 0.85;
		state.reveal = Math.min(state.reveal, clamp01(localSeconds / (durationSeconds * span)));
		if (caption === "words" || caption === "words-fast") state.revealUnit = "word";
		if (caption === "lines") state.revealUnit = "line";
	}
	if (inType !== "none" && inDuration > 0 && localSeconds < inDuration) {
		applyEdge({
			state,
			type: inType,
			t: clamp01(localSeconds / inDuration),
			entering: true,
		});
	}
	const untilEnd = durationSeconds - localSeconds;
	if (outType !== "none" && outDuration > 0 && untilEnd < outDuration) {
		applyEdge({
			state,
			type: outType,
			t: clamp01(untilEnd / outDuration),
			entering: false,
		});
	}
	return state;
}

export function hasAnimation(params: ParamValues): boolean {
	return ["animation.in", "animation.out", "animation.combo", "animation.caption"].some(
		(key) => str({ params, key }) !== "none",
	);
}
