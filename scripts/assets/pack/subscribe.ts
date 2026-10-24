import {
	arcPoints,
	EASE,
	ellipse,
	fill,
	group,
	type Key,
	path,
	type PathData,
	pathData,
	rect,
	seeded,
	type Shape,
	star,
	stroke,
	trim,
} from "../lottie-dsl";
import { type AssetContext, type AssetDef, cue, LANGUAGES, type LayerInput, PALETTE, slot } from "./common";
import { cursorClick } from "./pointer";
import shaped from "./subscribe-text.json";

// Generic, brand-free subscribe / bell / like buttons. Words are vector
// outlines (see scripts/assets/shape-text.py), never text layers, and each
// asset with words has English, Sinhala and Tamil variants with identical
// timing and colour slots.

export interface Word {
	text: string;
	advance: number;
	bbox: [number, number, number, number];
	contours: PathData[];
}
export const WORDS = (shaped as unknown as { words: Record<string, Word> }).words;

const RED = "#E53935";
const GREY = "#3A3F4B";
const SOFT = "#F4F6FA";
const { white: WHITE, ink: INK, amber: AMBER, blue: BLUE, teal: TEAL } = PALETTE;

const base = { category: "subscribe-buttons", loop: false, variants: LANGUAGES } as const;
const commonTags = ["subscribe", "youtube", "button", "සබ්ස්ක්‍රයිබ්", "சப்ஸ்கிரைப்"];

// ---------- text ----------

/**
 * A shaped word as filled outlines, centred on `at`. Latin capitals are
 * `cap` tall; Sinhala and Tamil (with their marks) are allowed a little
 * taller; everything shrinks to fit `maxW`.
 */
export function label(
	key: string,
	{ cap, maxW, color, at = [0, 0], opacity = 100, glow }: { cap: number; maxW: number; color: string; at?: number[]; opacity?: number | Key[]; glow?: { color: string; width: number; opacity: number | Key[] } },
): { shape: Shape; w: number; h: number } {
	const word = WORDS[key];
	if (!word) throw new Error(`No shaped word "${key}"; add it to scripts/assets/shape-text.py`);
	const [x0, y0, x1, y1] = word.bbox;
	const bw = x1 - x0;
	const bh = y1 - y0;
	const latin = key.startsWith("en.") || key.startsWith("digit.");
	const s = Math.min((cap * (latin ? 1 : 1.35)) / bh, maxW / bw);
	const items: Shape[] = word.contours.map((c) => path(c));
	if (glow) items.push(stroke(glow.color, glow.width / s, { opacity: glow.opacity }));
	items.push(fill(color));
	return {
		shape: group(items, { position: at, anchor: [(x0 + x1) / 2, (y0 + y1) / 2], scale: [s * 100, s * 100], opacity }, `Text ${word.text}`),
		w: bw * s,
		h: bh * s,
	};
}

export const lang = (ctx: AssetContext) => (ctx.variant === "default" ? "en" : ctx.variant);

/** A check mark centred on the origin, `size` wide, drawn on by `draw` (trim end keys). */
export function tick(color: string, size: number, width: number, draw: Key[], at: number[] = [0, 0]): Shape {
	const k = size / 2;
	return group(
		[path(pathData([[-k, 0], [-k * 0.3, k * 0.65], [k, -k * 0.7]])), trim(0, draw), stroke(color, width)],
		{ position: at },
		"Tick",
	);
}

/** "SUBSCRIBED" with a tick before it, centred; fades in from `at`. */
function subscribedLabel(ctx: AssetContext, { at, cap, maxW, color, offset = [0, 0] }: { at: number; cap: number; maxW: number; color: string; offset?: number[] }): Shape[] {
	const tickW = cap * 0.95;
	const gap = cap * 0.4;
	const text = label(`${lang(ctx)}.subscribed`, { cap, maxW: maxW - tickW - gap, color, opacity: [[at, 0, EASE.out], [at + 8, 100]] });
	const total = tickW + gap + text.w;
	const textShape = text.shape as { it: Shape[] };
	const transform = textShape.it[textShape.it.length - 1] as { p: unknown };
	transform.p = { a: 0, k: [offset[0] + total / 2 - text.w / 2, offset[1]] };
	return [tick(color, tickW, Math.max(6, cap * 0.22), [[at + 2, 0, EASE.out], [at + 14, 100]], [offset[0] - total / 2 + tickW / 2, offset[1] + cap * 0.05]), text.shape];
}

// ---------- shapes ----------

export const pill = (w: number, h: number, color: string, opacity: number | Key[] = 100, at: number[] = [0, 0]) =>
	group([rect([w, h], [0, 0], h / 2), fill(color, opacity)], { position: at }, "Pill");

/** A closed rounded rectangle path centred on the origin, starting top-centre, clockwise. */
export function roundRectPath(w: number, h: number, r: number): PathData {
	const x = w / 2 - r;
	const y = h / 2 - r;
	const pts = [
		...arcPoints(x, -y, r, -90, 0),
		...arcPoints(x, y, r, 0, 90),
		...arcPoints(-x, y, r, 90, 180),
		...arcPoints(-x, -y, r, 180, 270),
	];
	return pathData([[0, -h / 2], ...pts, [0, -h / 2]] as Array<[number, number, number, number, number, number] | [number, number]>, true);
}

const bellPath = pathData(
	[[0, -150, -78, 0, 78, 0], [110, -40, 0, -70, 0, 60], [128, 80, -4, -30, 8, 18], [165, 120, 0, -20, 0, 0], [-165, 120, 0, 0, 0, -20], [-128, 80, -8, 18, 4, -30], [-110, -40, 0, 60, 0, -70]],
	true,
);

/** A bell hanging from the origin (its pivot), about 330 × 330 at scale 1. */
export function bell(color: string, { fillOpacity = 100, outline }: { fillOpacity?: number | Key[]; outline?: { color: string; width: number } } = {}): Shape[] {
	const body: Shape[] = [path(bellPath)];
	if (outline) body.push(stroke(outline.color, outline.width));
	body.push(fill(color, fillOpacity));
	return [
		group([ellipse([64, 64], [0, 300]), fill(color, fillOpacity), ...(outline ? [stroke(outline.color, outline.width)] : [])], {}, "Clapper"),
		group(body, { position: [0, 160] }, "Bell body"),
		group([ellipse([44, 44], [0, 0]), fill(color)], {}, "Knob"),
	];
}

export const ringSwing = (start: number, amp = 18): Key[] => [
	[start, 0, EASE.soft],
	[start + 6, amp],
	[start + 14, -amp * 0.85],
	[start + 22, amp * 0.6],
	[start + 30, -amp * 0.4],
	[start + 38, amp * 0.15],
	[start + 45, 0],
];

/** Short lines bursting out from the origin at `start`. */
export function burst(color: string, start: number, { count = 8, r1 = 120, r2 = 170, width = 12, offset = 0 } = {}): Shape[] {
	return Array.from({ length: count }, (_, i) =>
		group(
			[
				path(pathData([[0, -r1], [0, -r2]])),
				trim([[start, 0, EASE.out], [start + 10, 0], [start + 18, 100]], [[start, 0, EASE.out], [start + 10, 100]]),
				stroke(color, width),
			],
			{ rotation: offset + (i * 360) / count },
			"Ray",
		),
	);
}

/** A generic thumbs-up centred on the origin, about 260 tall at scale 1. */
export function thumb(color: string): Shape[] {
	return [
		group([rect([62, 150], [0, 0], 16), fill(color)], { position: [-98, 40] }, "Cuff"),
		group([rect([150, 150], [0, 0], 34), fill(color)], { position: [10, 40] }, "Palm"),
		group([rect([64, 150], [0, 0], 32), fill(color)], { position: [-6, -62], rotation: 22 }, "Thumb"),
	];
}

const cursorArrow = pathData([[0, 0], [0, 92], [24, 70], [40, 106], [56, 99], [40, 64], [70, 64]], true);

/** Pop in (0 → overshoot → 100) then a squash when pressed at `press`. */
export const popPress = (pop: number, press?: number): Key[] => [
	[pop, [0, 0], EASE.out],
	[pop + 9, [110, 110], EASE.inOut],
	[pop + 16, [100, 100]],
	...(press !== undefined ? ([[press, [100, 100], EASE.out], [press + 4, [92, 92], EASE.back], [press + 16, [100, 100]]] as Key[]) : []),
];

export const fadeIn = (t: number, len = 6): Key[] => [[t, 0, EASE.out], [t + len, 100]];
export const fadeOut = (t: number, len = 6): Key[] => [[t, 100, EASE.in], [t + len, 0]];

/**
 * A subscribe pill that, pressed at `press`, turns its pressed colour and
 * swaps to "SUBSCRIBED" with a tick. Returns its layers (top first).
 */
function subscribeButton(
	ctx: AssetContext,
	{ at, w, h, cap, pop = 0, press, scale, shadow = true }: { at: number[]; w: number; h: number; cap: number; pop?: number; press?: number; scale?: Key[]; shadow?: boolean },
): LayerInput[] {
	const { c } = ctx;
	const s = scale ?? popPress(pop, press);
	const maxW = w - h * 0.75;
	const layers: LayerInput[] = [];
	const swap = press !== undefined ? press + 3 : undefined;
	layers.push({
		name: "Label",
		position: at,
		scale: s,
		shapes: [
			label(`${lang(ctx)}.subscribe`, { cap, maxW, color: c("text"), opacity: swap !== undefined ? fadeOut(swap, 5) : 100 }).shape,
			...(swap !== undefined ? subscribedLabel(ctx, { at: swap + 3, cap: cap * 0.92, maxW, color: c("text") }) : []),
		],
	});
	if (swap !== undefined) layers.push({ name: "Pressed", position: at, scale: s, opacity: fadeIn(swap, 6), shapes: [pill(w, h, c("pressed"))] });
	layers.push({ name: "Button", position: at, scale: s, shapes: [pill(w, h, c("button"))] });
	if (shadow) layers.push({ name: "Shadow", position: [at[0], at[1] + h * 0.09], scale: s, shapes: [pill(w, h, c("shadow"), 35)] });
	return layers;
}

const S = { w: 900, h: 300 } as const;

export const subscribeButtons: AssetDef[] = [
	{
		...base,
		...S,
		id: "sub-classic-click",
		name: "Subscribe click",
		description: "A pill button pops in, a cursor glides over and clicks, and it turns grey with a tick and “Subscribed”.",
		tags: [...commonTags, "click", "cursor", "subscribed", "pill"],
		durationSec: 3.5,
		thumbAt: 0.4,
		colors: [slot("button", "Button", RED), slot("pressed", "Subscribed button", GREY), slot("text", "Text", WHITE), slot("cursor", "Cursor", SOFT), slot("shadow", "Shadow & outline", INK)],
		sounds: [cue("pop", 0, -4), cue("click", 44)],
		build: (ctx) => [
			{
				name: "Cursor",
				position: [[16, [980, 380], EASE.inOut], [40, [560, 182]], [74, [560, 182], EASE.in], [100, [980, 380]]],
				scale: [[0, [80, 80]], [42, [80, 80], EASE.out], [46, [66, 66], EASE.out], [52, [80, 80]]],
				opacity: [[16, 0, EASE.out], [22, 100], [90, 100, EASE.in], [100, 0]],
				shapes: [path(cursorArrow), fill(ctx.c("cursor")), stroke(ctx.c("shadow"), 7)],
			},
			...subscribeButton(ctx, { at: [450, 150], w: 580, h: 150, cap: 50, press: 44 }),
		],
	},
	{
		...base,
		w: 1000,
		h: 300,
		id: "sub-bell-combo",
		name: "Subscribe + bell",
		description: "The subscribe button is pressed, then a bell beside it rings with a wiggle and burst lines.",
		tags: [...commonTags, "bell", "notification", "ring", "subscribed"],
		durationSec: 4,
		thumbAt: 0.5,
		colors: [slot("button", "Button", RED), slot("pressed", "Subscribed & bell circle", GREY), slot("text", "Text", WHITE), slot("accent", "Bell & burst", AMBER), slot("shadow", "Shadow", INK)],
		sounds: [cue("pop", 0, -4), cue("click", 28), cue("ding", 50, -2)],
		build: (ctx) => {
			const { c } = ctx;
			return [
				{ name: "Burst", position: [820, 150], shapes: burst(c("accent"), 56, { r1: 95, r2: 135, width: 10 }) },
				{ name: "Bell", position: [820, 104], scale: [[6, [0, 0], EASE.out], [16, [26, 26], EASE.inOut], [22, [23, 23]]], rotation: ringSwing(50), shapes: bell(c("accent")) },
				{ name: "Bell circle", position: [820, 150], scale: popPress(6, 48), shapes: [group([ellipse([140, 140]), fill(c("pressed"))])] },
				{ name: "Bell shadow", position: [820, 163], scale: popPress(6, 48), shapes: [group([ellipse([140, 140]), fill(c("shadow"), 35)])] },
				...subscribeButton(ctx, { at: [400, 150], w: 580, h: 150, cap: 50, press: 28 }),
			];
		},
	},

	{
		...base,
		w: 1200,
		h: 300,
		id: "sub-like-subscribe-bell",
		name: "Like, subscribe, bell bar",
		description: "A bar with a thumbs-up, a subscribe button and a bell, tapped one after another.",
		tags: [...commonTags, "like", "thumbs up", "bell", "notification", "bar", "sequence"],
		durationSec: 4,
		thumbAt: 0.75,
		colors: [slot("button", "Button", RED), slot("pressed", "Subscribed & circles", GREY), slot("text", "Text & icons", WHITE), slot("liked", "Liked", BLUE), slot("accent", "Burst", AMBER), slot("bar", "Bar", INK)],
		sounds: [cue("whoosh", 0, -8), cue("pop", 28), cue("click", 54), cue("ding", 80, -2)],
		build: (ctx) => {
			const { c } = ctx;
			const circle = (x: number, pop: number, press: number, extra: Shape[] = []): LayerInput => ({ name: "Circle", position: [x, 150], scale: popPress(pop, press), shapes: [...extra, group([ellipse([150, 150]), fill(c("pressed"))])] });
			return [
				{ name: "Like burst", position: [190, 150], shapes: burst(c("accent"), 30, { r1: 92, r2: 130, width: 10 }) },
				{ name: "Bell burst", position: [1010, 150], shapes: burst(c("accent"), 82, { r1: 92, r2: 130, width: 10, offset: 22 }) },
				{ name: "Thumb", position: [196, 150], scale: [[6, [0, 0], EASE.out], [15, [33, 33], EASE.inOut], [22, [30, 30]], [28, [30, 30], EASE.out], [32, [38, 38], EASE.back], [42, [30, 30]]], rotation: [[28, 0, EASE.out], [32, -14], [42, 0]], shapes: thumb(c("text")) },
				{ name: "Bell", position: [1010, 108], scale: [[14, [0, 0], EASE.out], [23, [27, 27], EASE.inOut], [30, [24, 24]]], rotation: ringSwing(82), shapes: bell(c("text")) },
				circle(190, 6, 28, [group([ellipse([150, 150]), fill(c("liked"), fadeIn(30, 5))], {}, "Liked")]),
				circle(1010, 14, 80),
				...subscribeButton(ctx, { at: [600, 150], w: 500, h: 150, cap: 46, pop: 10, press: 54, shadow: false }),
				{ name: "Bar", position: [600, 150], scale: [[0, [0, 100], EASE.out], [14, [100, 100]]], shapes: [group([rect([1160, 220], [0, 0], 110), fill(c("bar"), 85)])] },
			];
		},
	},
	{
		...base,
		w: 900,
		h: 400,
		id: "sub-bounce-pop",
		name: "Bounce pop",
		description: "The subscribe button drops in, squashes on landing and bounces to rest with a spark.",
		tags: [...commonTags, "bounce", "pop", "drop"],
		durationSec: 2.5,
		thumbAt: 0.8,
		colors: [slot("button", "Button", RED), slot("text", "Text", WHITE), slot("accent", "Sparks", AMBER), slot("shadow", "Shadow", INK)],
		sounds: [cue("pop", 14)],
		build: (ctx) => {
			const { c } = ctx;
			const y: Key[] = [[0, [450, -10], EASE.in], [14, [450, 300], EASE.out], [23, [450, 236], EASE.in], [31, [450, 300], EASE.out], [36, [450, 282], EASE.in], [41, [450, 300]]];
			const squash: Key[] = [[0, [94, 108]], [13, [94, 108], EASE.out], [16, [114, 84], EASE.inOut], [22, [96, 104], EASE.inOut], [31, [106, 94], EASE.inOut], [36, [99, 101], EASE.inOut], [42, [100, 100]]];
			const spark = (side: 1 | -1) => [0, 1, 2].map((i) => group([path(pathData([[0, 0], [side * 46, 0]])), trim([[14, 0, EASE.out], [20, 0], [27, 100]], [[14, 0, EASE.out], [20, 100]]), stroke(c("accent"), 10)], { position: [side * 330, -40 + i * 40], rotation: side * (i - 1) * 25 }));
			return [
				{ name: "Sparks", position: [450, 230], shapes: [...spark(1), ...spark(-1)] },
				{ name: "Label", position: y, anchor: [0, 70], scale: squash, shapes: [label(`${lang(ctx)}.subscribe`, { cap: 50, maxW: 470, color: c("text") }).shape] },
				{ name: "Button", position: y, anchor: [0, 70], scale: squash, shapes: [pill(580, 140, c("button"))] },
				{ name: "Shadow", position: [450, 318], scale: [[0, [20, 20], EASE.in], [14, [100, 100], EASE.out], [23, [80, 80], EASE.in], [31, [100, 100]]], opacity: [[0, 0], [14, 40]], shapes: [group([ellipse([560, 30]), fill(c("shadow"))])] },
			];
		},
	},
	{
		...base,
		...S,
		id: "sub-slide-shine",
		name: "Slide-in shine",
		description: "The button slides in from the left and a light sweep runs across it.",
		tags: [...commonTags, "slide", "shine", "sweep", "gloss"],
		durationSec: 3,
		thumbAt: 0.6,
		colors: [slot("button", "Button", RED), slot("text", "Text", WHITE), slot("shine", "Shine", SOFT), slot("shadow", "Shadow", INK)],
		sounds: [cue("whoosh", 0)],
		build: (ctx) => {
			const { c } = ctx;
			const x = (dy = 0): Key[] => [[0, [-340, 150 + dy], EASE.back], [22, [450, 150 + dy]]];
			const sweep = (start: number): Shape => group([rect([70, 260]), fill(c("shine"), 55)], { position: [[start, [-420, 0], EASE.inOut], [start + 22, [420, 0]]], rotation: 20 });
			return [
				{ name: "Shine", position: x(), masks: [roundRectPath(580, 150, 75)], shapes: [sweep(26), group([rect([30, 260]), fill(c("shine"), 40)], { position: [[30, [-420, 0], EASE.inOut], [52, [420, 0]]], rotation: 20 }), sweep(62)] },
				{ name: "Label", position: x(), shapes: [label(`${lang(ctx)}.subscribe`, { cap: 50, maxW: 470, color: c("text") }).shape] },
				{ name: "Button", position: x(), shapes: [pill(580, 150, c("button"))] },
				{ name: "Shadow", position: x(14), opacity: 35, shapes: [pill(580, 150, c("shadow"))] },
			];
		},
	},
	{
		...base,
		...S,
		id: "sub-neon-glow",
		name: "Neon glow",
		description: "A neon outline button that flickers on and pulses its glow.",
		tags: [...commonTags, "neon", "glow", "outline", "pulse"],
		durationSec: 3,
		loop: true,
		thumbAt: 0.5,
		colors: [slot("neon", "Neon", "#FF4D6D"), slot("text", "Core & text", WHITE), slot("background", "Background", INK)],
		sounds: [cue("pop", 4, -6)],
		build: (ctx) => {
			const { c } = ctx;
			const glow: Key[] = [[0, 0], [4, 100], [6, 20], [9, 100], [12, 40], [15, 100, EASE.soft], [45, 60, EASE.soft], [75, 100, EASE.soft], [89, 100], [90, 0]];
			const ring = (w: number, op: number) => group([rect([580, 150], [0, 0], 75), stroke(c("neon"), w, { opacity: op })]);
			return [
				{ name: "Label", position: [450, 150], opacity: glow, shapes: [label(`${lang(ctx)}.subscribe`, { cap: 50, maxW: 460, color: c("text"), glow: { color: c("neon"), width: 14, opacity: 45 } }).shape] },
				{ name: "Core", position: [450, 150], opacity: glow, shapes: [group([rect([580, 150], [0, 0], 75), stroke(c("text"), 3, { opacity: 85 })])] },
				{ name: "Glow", position: [450, 150], opacity: glow, shapes: [ring(10, 100), ring(22, 30), ring(40, 12)] },
				{ name: "Background", position: [450, 150], shapes: [group([rect([860, 270], [0, 0], 48), fill(c("background"))])] },
			];
		},
	},
	{
		...base,
		...S,
		id: "sub-ghost-outline",
		name: "Ghost outline",
		description: "A minimal outline button draws itself, then fills from the left.",
		tags: [...commonTags, "outline", "ghost", "minimal"],
		durationSec: 2.5,
		thumbAt: 0.45,
		colors: [slot("button", "Button & outline", RED), slot("text", "Filled text", WHITE), slot("shadow", "Shadow", INK)],
		sounds: [cue("whoosh", 0, -6), cue("pop", 42, -4)],
		build: (ctx) => {
			const { c } = ctx;
			const key = `${lang(ctx)}.subscribe`;
			return [
				{ name: "Filled label", position: [450, 150], opacity: fadeIn(42, 8), shapes: [label(key, { cap: 48, maxW: 460, color: c("text") }).shape] },
				{ name: "Fill", position: [450, 150], masks: [roundRectPath(580, 150, 75)], shapes: [group([rect([600, 170]), fill(c("button"))], { position: [[34, [-600, 0], EASE.inOut], [50, [0, 0]]] })] },
				{ name: "Outline label", position: [450, 150], opacity: [[10, 0, EASE.out], [24, 100]], shapes: [label(key, { cap: 48, maxW: 460, color: c("button") }).shape] },
				{ name: "Outline", position: [450, 150], shapes: [group([path(roundRectPath(580, 150, 75)), trim(0, [[0, 0, EASE.inOut], [24, 100]]), stroke(c("button"), 8)])] },
				{ name: "Shadow", position: [450, 164], opacity: [[44, 0, EASE.out], [56, 30]], shapes: [pill(580, 150, c("shadow"))] },
			];
		},
	},
	{
		...base,
		...S,
		id: "sub-glass",
		name: "Frosted glass",
		description: "A frosted-glass button over drifting colour blobs; pressed, it switches to “Subscribed”.",
		tags: [...commonTags, "glass", "frosted", "blur", "subscribed"],
		durationSec: 3,
		thumbAt: 0.4,
		colors: [slot("button", "Blob 1", RED), slot("accent", "Blob 2", BLUE), slot("text", "Glass & text", WHITE), slot("shadow", "Shadow", INK)],
		sounds: [cue("pop", 0, -4), cue("click", 44)],
		build: (ctx) => {
			const { c } = ctx;
			const s = popPress(0, 44);
			return [
				{ name: "Label", position: [450, 150], scale: s, shapes: [label(`${lang(ctx)}.subscribe`, { cap: 48, maxW: 460, color: c("text"), opacity: fadeOut(47, 5) }).shape, ...subscribedLabel(ctx, { at: 50, cap: 44, maxW: 470, color: c("text") })] },
				{ name: "Glass", position: [450, 150], scale: s, shapes: [group([rect([600, 150], [0, 0], 75), stroke(c("text"), 3, { opacity: 55 }), fill(c("text"), [[0, 18], [46, 18, EASE.out], [52, 30]])])] },
				{ name: "Shadow", position: [450, 162], scale: s, shapes: [pill(600, 150, c("shadow"), 22)] },
				{ name: "Blob 1", position: [[0, [300, 120], EASE.soft], [90, [360, 170]]], scale: popPress(4), shapes: [group([ellipse([190, 190]), fill(c("button"), 90)])] },
				{ name: "Blob 2", position: [[0, [640, 190], EASE.soft], [90, [570, 120]]], scale: popPress(8), shapes: [group([ellipse([150, 150]), fill(c("accent"), 90)])] },
			];
		},
	},
	{
		...base,
		w: 1100,
		h: 300,
		id: "sub-avatar-bar",
		name: "Channel bar",
		description: "A channel bar with an empty avatar circle and name placeholder (cover them with your own picture and text) and a subscribe button that gets clicked.",
		tags: [...commonTags, "channel", "avatar", "profile", "lower third", "subscribed"],
		durationSec: 3.5,
		thumbAt: 0.45,
		colors: [slot("panel", "Bar", INK), slot("placeholder", "Avatar & name area", "#596070"), slot("accent", "Avatar ring", AMBER), slot("button", "Button", RED), slot("pressed", "Subscribed button", GREY), slot("text", "Text", WHITE)],
		sounds: [cue("whoosh", 0, -6), cue("pop", 18, -4), cue("click", 58)],
		build: (ctx) => {
			const { c } = ctx;
			const grow = (t: number): Key[] => [[t, [0, 100], EASE.out], [t + 12, [100, 100]]];
			return [
				...subscribeButton(ctx, { at: [880, 150], w: 340, h: 120, cap: 38, pop: 18, press: 58, shadow: false }),
				{ name: "Name", position: [250, 150], shapes: [group([rect([330, 36], [165, 0], 18), fill(c("placeholder"))], { position: [0, -24], scale: grow(14) }), group([rect([210, 24], [105, 0], 12), fill(c("placeholder"), 55)], { position: [0, 26], scale: grow(18) })] },
				{ name: "Avatar ring", position: [140, 150], shapes: [group([ellipse([176, 176]), trim(0, [[10, 0, EASE.inOut], [32, 100]]), stroke(c("accent"), 8)], { rotation: -90 })] },
				{ name: "Avatar", position: [140, 150], scale: popPress(8), shapes: [group([ellipse([150, 150]), fill(c("placeholder"))])] },
				{ name: "Panel", position: [[0, [550, 190], EASE.out], [14, [550, 150]]], opacity: fadeIn(0, 10), shapes: [group([rect([1070, 220], [0, 0], 110), fill(c("panel"), 92)])] },
			];
		},
	},
	{
		...base,
		w: 800,
		h: 800,
		id: "sub-cursor-click",
		name: "Cursor click",
		description: "A mouse cursor glides in and clicks the subscribe button with a ripple — sized for vertical, mobile and Shorts videos.",
		tags: [...commonTags, "click", "cursor", "mouse", "pointer", "mobile", "shorts", "vertical", "subscribed"],
		durationSec: 3,
		thumbAt: 0.46,
		colors: [slot("button", "Button", RED), slot("pressed", "Subscribed button", GREY), slot("text", "Text", WHITE), slot("cursor", "Cursor", SOFT), slot("outline", "Cursor outline & shadow", INK), slot("accent", "Click ripple", AMBER)],
		sounds: [cue("pop", 0, -4), cue("click", 40)],
		build: (ctx) => {
			const { c } = ctx;
			const button = subscribeButton({ ...ctx, c: (id: string) => (id === "shadow" ? c("outline") : c(id)) }, { at: [400, 330], w: 640, h: 170, cap: 56, pop: 0, press: 40 });
			return [
				...cursorClick({ at: [470, 350], from: [690, 760], arrive: 32, press: 40, leave: 66, fill: c("cursor"), outline: c("outline"), ripple: c("accent"), scale: 150, rippleSize: 180 }),
				...button,
			];
		},
	},
	{
		...base,
		...S,
		id: "sub-glitch",
		name: "Glitch",
		description: "A subscribe button that glitches in with RGB-split jumps.",
		tags: [...commonTags, "glitch", "rgb", "split", "distortion"],
		durationSec: 2.5,
		thumbAt: 0.19,
		colors: [slot("button", "Button", RED), slot("text", "Text", WHITE), slot("split1", "Split 1", "#00E5FF"), slot("split2", "Split 2", "#FF2DAA")],
		sounds: [cue("whoosh", 6, -4)],
		build: (ctx) => {
			const { c } = ctx;
			const rnd = seeded(11);
			const jitter = (amp: number, sign: number): Key[] => {
				const keys: Key[] = [[0, [450, 150], EASE.linear]];
				for (const [a, b] of [[6, 18], [42, 50], [62, 66]]) {
					keys.push([a, [450, 150], EASE.linear]);
					for (let t = a + 2; t < b; t += 2) keys.push([t, [450 + sign * amp * (0.4 + rnd()), 150 + (rnd() - 0.5) * amp * 0.5], EASE.linear]);
					keys.push([b, [450, 150], EASE.linear]);
				}
				keys.push([75, [450, 150]]);
				return keys;
			};
			const flicker: Key[] = [[0, 0, EASE.linear], [2, 100, EASE.linear], [4, 20, EASE.linear], [6, 100]];
			const text = (color: string) => label(`${lang(ctx)}.subscribe`, { cap: 50, maxW: 460, color }).shape;
			const slices = group(
				[0, 1, 2].map((i) => group([rect([200 + i * 60, 14]), fill(c("button"))], { position: [[0, [0, 0]], [8 + i * 2, [0, 0], EASE.linear], [9 + i * 2, [(i - 1) * 90, -50 + i * 50], EASE.linear], [14 + i * 2, [(i - 1) * 90, -50 + i * 50], EASE.linear], [15 + i * 2, [0, 0]]] })),
				{ opacity: [[0, 0, EASE.linear], [8, 100, EASE.linear], [18, 0]] },
			);
			return [
				{ name: "Text", position: [450, 150], opacity: flicker, shapes: [text(c("text"))] },
				{ name: "Text split 1", position: jitter(12, -1), opacity: flicker, shapes: [text(c("split1"))] },
				{ name: "Text split 2", position: jitter(12, 1), opacity: flicker, shapes: [text(c("split2"))] },
				{ name: "Button", position: [450, 150], opacity: flicker, shapes: [slices, pill(580, 150, c("button"))] },
				{ name: "Split 1", position: jitter(16, -1), opacity: flicker, shapes: [pill(580, 150, c("split1"))] },
				{ name: "Split 2", position: jitter(16, 1), opacity: flicker, shapes: [pill(580, 150, c("split2"))] },
			];
		},
	},
	{
		...base,
		w: 900,
		h: 340,
		id: "sub-3d-press",
		name: "3D press",
		description: "A raised button that sinks into its base when pressed and stays down as “Subscribed”.",
		tags: [...commonTags, "3d", "press", "push", "depth", "subscribed"],
		durationSec: 2.5,
		thumbAt: 0.35,
		colors: [slot("button", "Button", RED), slot("side", "Button side", "#9E1F1C"), slot("pressed", "Subscribed button", GREY), slot("pressedSide", "Subscribed side", "#262A33"), slot("text", "Text", WHITE), slot("shadow", "Shadow", INK)],
		sounds: [cue("pop", 0, -4), cue("click", 30)],
		build: (ctx) => {
			const { c } = ctx;
			const top: Key[] = [[0, [450, 150], EASE.out], [28, [450, 150], EASE.in], [33, [450, 172], EASE.out], [44, [450, 164]]];
			const s = popPress(0);
			return [
				{ name: "Label", position: top, scale: s, shapes: [label(`${lang(ctx)}.subscribe`, { cap: 48, maxW: 460, color: c("text"), opacity: fadeOut(33, 5) }).shape, ...subscribedLabel(ctx, { at: 35, cap: 44, maxW: 470, color: c("text") })] },
				{ name: "Top pressed", position: top, scale: s, opacity: fadeIn(32, 6), shapes: [pill(580, 140, c("pressed"))] },
				{ name: "Top", position: top, scale: s, shapes: [pill(580, 140, c("button"))] },
				{ name: "Side pressed", position: [450, 176], scale: s, opacity: fadeIn(32, 6), shapes: [pill(580, 140, c("pressedSide"))] },
				{ name: "Side", position: [450, 176], scale: s, shapes: [pill(580, 140, c("side"))] },
				{ name: "Shadow", position: [450, 206], scale: [[0, [0, 0], EASE.out], [16, [100, 100]], [28, [100, 100], EASE.in], [33, [94, 80]]], opacity: 30, shapes: [group([ellipse([620, 60]), fill(c("shadow"))])] },
			];
		},
	},
	{
		...base,
		w: 900,
		h: 500,
		id: "sub-countdown",
		name: "Countdown end screen",
		description: "A 3-2-1 countdown runs around the button, then it clicks to “Subscribed”. Made for end screens.",
		tags: [...commonTags, "countdown", "end screen", "timer", "3 2 1", "subscribed"],
		durationSec: 4,
		thumbAt: 0.4,
		colors: [slot("button", "Button", RED), slot("pressed", "Subscribed button", GREY), slot("text", "Text", WHITE), slot("accent", "Ring & digits", AMBER), slot("track", "Track & badge", INK)],
		sounds: [cue("click", 10, -10), cue("click", 40, -10), cue("click", 70, -10), cue("click", 100), cue("ding", 103, -4)],
		build: (ctx) => {
			const { c } = ctx;
			const digit = (n: number, t: number) =>
				group([label(`digit.${n}`, { cap: 52, maxW: 80, color: c("accent") }).shape], {
					opacity: [[t, 0, EASE.out], [t + 4, 100], [t + 26, 100, EASE.in], [t + 30, 0]],
					scale: [[t, [60, 60], EASE.back], [t + 8, [100, 100]]],
				});
			const ring = roundRectPath(660, 230, 115);
			return [
				{ name: "Digits", position: [450, 80], shapes: [digit(3, 10), digit(2, 40), digit(1, 70)] },
				{ name: "Badge", position: [450, 80], scale: [[4, [0, 0], EASE.back], [14, [100, 100]], [98, [100, 100], EASE.in], [104, [0, 0]]], shapes: [group([ellipse([100, 100]), fill(c("track"))])] },
				{ name: "Ring", position: [450, 290], opacity: [[96, 100, EASE.in], [104, 0]], shapes: [group([path(ring), trim(0, [[10, 100, EASE.linear], [100, 0]]), stroke(c("accent"), 12)])] },
				{ name: "Track", position: [450, 290], opacity: [[0, 0, EASE.out], [10, 60], [96, 60, EASE.in], [104, 0]], shapes: [group([path(ring), stroke(c("track"), 12)])] },
				...subscribeButton({ ...ctx, c: (id: string) => (id === "shadow" ? c("track") : c(id)) }, { at: [450, 290], w: 560, h: 150, cap: 50, press: 100 }),
			];
		},
	},
	{
		category: "subscribe-buttons",
		loop: false,
		w: 600,
		h: 600,
		id: "bell-notifications-on",
		name: "Notifications on",
		description: "A crossed-out bell loses its slash, fills in, rings and gets a dot: “turn on notifications” without words.",
		tags: ["bell", "notification", "notifications on", "alert", "subscribe", "youtube", "icon"],
		durationSec: 3,
		thumbAt: 0.7,
		colors: [slot("bell", "Bell", WHITE), slot("disc", "Circle", INK), slot("accent", "Burst", AMBER), slot("badge", "Dot", RED)],
		sounds: [cue("click", 44), cue("ding", 46, -2)],
		build: ({ c }) => {
			const slash = pathData([[-170, -170], [170, 170]]);
			const gone: Key[] = [[30, 100, EASE.inOut], [42, 0]];
			return [
				{ name: "Dot", position: [410, 190], scale: [[58, [0, 0], EASE.back], [68, [100, 100]]], shapes: [group([ellipse([70, 70]), fill(c("badge"))]), group([ellipse([70, 70]), stroke(c("disc"), 10)])] },
				{ name: "Slash", position: [300, 300], scale: [[0, [45, 45]]], shapes: [group([path(slash), trim(0, gone), stroke(c("bell"), 26)]), group([path(slash), trim(0, gone), stroke(c("disc"), 54)])] },
				{ name: "Burst", position: [300, 300], shapes: burst(c("accent"), 50, { r1: 190, r2: 240, width: 14 }) },
				{ name: "Bell", position: [300, 215], scale: [[0, [0, 0], EASE.out], [12, [52, 52], EASE.inOut], [18, [48, 48]]], rotation: ringSwing(46, 20), shapes: bell(c("bell"), { fillOpacity: fadeIn(40, 8), outline: { color: c("bell"), width: 24 } }) },
				{ name: "Circle", position: [300, 300], scale: popPress(0, 44), shapes: [group([ellipse([440, 440]), fill(c("disc"))])] },
			];
		},
	},
	{
		...base,
		w: 1200,
		h: 300,
		id: "sub-join-pair",
		name: "Subscribe + join",
		description: "A subscribe button and a member “Join” button pop in side by side; subscribe is clicked, join sparkles.",
		tags: [...commonTags, "join", "member", "membership", "pair", "subscribed"],
		durationSec: 3.5,
		thumbAt: 0.75,
		colors: [slot("button", "Button", RED), slot("pressed", "Subscribed button", GREY), slot("text", "Text", WHITE), slot("member", "Join button", BLUE), slot("accent", "Sparkle", AMBER), slot("shadow", "Shadow", INK)],
		sounds: [cue("pop", 8, -4), cue("click", 36), cue("confetti", 64, -6)],
		build: (ctx) => {
			const { c } = ctx;
			const s = popPress(8, 62);
			const sparkle = (at: number[], t: number, size: number) => group([star({ points: 4, outer: size, inner: size * 0.38 }), fill(c("accent"))], { position: at, scale: [[t, [0, 0], EASE.back], [t + 8, [100, 100], EASE.in], [t + 20, [0, 0]]], rotation: [[t, 0], [t + 20, 90]] });
			return [
				{ name: "Sparkles", position: [930, 150], shapes: [sparkle([150, -70], 64, 34), sparkle([-160, 60], 70, 24), sparkle([170, 55], 76, 20)] },
				{ name: "Join label", position: [930, 150], scale: s, shapes: [label(`${lang(ctx)}.join`, { cap: 48, maxW: 250, color: c("text") }).shape] },
				{ name: "Join", position: [930, 150], scale: s, shapes: [pill(340, 140, c("member"))] },
				{ name: "Join shadow", position: [930, 162], scale: s, shapes: [pill(340, 140, c("shadow"), 35)] },
				...subscribeButton(ctx, { at: [430, 150], w: 560, h: 140, cap: 48, press: 36 }),
			];
		},
	},
	{
		...base,
		w: 900,
		h: 500,
		id: "sub-sticker-confetti",
		name: "Sticker with confetti",
		description: "A tilted sticker-style subscribe badge slaps on with a burst of confetti.",
		tags: [...commonTags, "sticker", "badge", "confetti", "celebrate", "tilted"],
		durationSec: 3,
		thumbAt: 0.3,
		colors: [slot("button", "Button", RED), slot("text", "Text", WHITE), slot("sticker", "Sticker edge", SOFT), slot("shadow", "Shadow", INK), slot("confetti1", "Confetti 1", AMBER), slot("confetti2", "Confetti 2", BLUE), slot("confetti3", "Confetti 3", TEAL)],
		sounds: [cue("pop", 6), cue("confetti", 6, -2)],
		build: (ctx) => {
			const { c } = ctx;
			const rnd = seeded(2024);
			const colours = ["confetti1", "confetti2", "confetti3", "button"];
			const pieces = Array.from({ length: 30 }, (_, i) => {
				const a = rnd() * Math.PI * 2;
				const d = 200 + rnd() * 220;
				const x = Math.cos(a) * d;
				const y = Math.sin(a) * d * 0.6;
				const t = 6 + Math.round(rnd() * 4);
				const shape = i % 3 === 0 ? ellipse([16, 16]) : rect([12 + rnd() * 10, 22 + rnd() * 10], [0, 0], 3);
				return group([shape, fill(c(colours[i % 4]))], {
					position: [[t, [0, 0], EASE.out], [t + 20, [x, y], EASE.in], [90, [x + (rnd() - 0.5) * 60, y + 160 + rnd() * 80]]],
					rotation: [[t, 0], [90, (rnd() - 0.5) * 720]],
					opacity: [[t, 0], [t + 1, 100], [70, 100, EASE.in], [90, 0]],
				});
			});
			const rot: Key[] = [[0, -30, EASE.out], [10, -3, EASE.inOut], [18, -9, EASE.inOut], [26, -7, EASE.soft], [58, -5, EASE.soft], [90, -7]];
			const sc: Key[] = [[0, [160, 160], EASE.in], [8, [92, 92], EASE.out], [16, [104, 104], EASE.inOut], [24, [100, 100]]];
			return [
				{ name: "Confetti", position: [450, 250], shapes: pieces },
				{ name: "Label", position: [450, 250], rotation: rot, scale: sc, opacity: fadeIn(0, 4), shapes: [label(`${lang(ctx)}.subscribe`, { cap: 52, maxW: 440, color: c("text") }).shape] },
				{ name: "Sticker", position: [450, 250], rotation: rot, scale: sc, opacity: fadeIn(0, 4), shapes: [pill(600, 160, c("button")), pill(650, 210, c("sticker"))] },
				{ name: "Shadow", position: [462, 266], rotation: rot, scale: sc, opacity: [[0, 0], [8, 30]], shapes: [pill(650, 210, c("shadow"))] },
			];
		},
	},
];
