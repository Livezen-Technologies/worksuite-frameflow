import type { ParamDefinition, ParamValues } from "@/params";

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
			state.offsetY -= (1 - easeOutBounce(t)) * 0.9;
			state.scale *= 1 + 0.15 * (1 - easeInCubic(t));
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
