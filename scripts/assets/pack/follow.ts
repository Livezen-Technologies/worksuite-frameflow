import { EASE, ellipse, fill, group, type Key, path, type PathData, pathData, rect, seeded, type Shape, smoothLine, star, stroke, trim } from "../lottie-dsl";
import { type AssetContext, type AssetDef, LANGUAGES, type LayerInput, PALETTE, slot } from "./common";
import { bell, burst, cursorArrow, fadeIn, fadeOut, label, lang, pill, popPress, ringSwing, ripple, roundRectPath, thumb, tick } from "./subscribe";

// Generic follow / like / share / save buttons for three short-video and
// social-feed moods. The platform names are only category labels and tags:
// there are no logos, glyphs, wordmarks or brand gradients, and the default
// colours are this pack's own (each one a colour slot). Words are HarfBuzz
// outlines (scripts/assets/shape-text.py) in English, Sinhala and Tamil.

const { white: WHITE, ink: INK, amber: AMBER } = PALETTE;
const GREY = "#3A3F4B";
const SOFT = "#F4F6FA";
const MUTED = "#596070";

// Mood colours: deliberately not any platform's brand values.
const FB_BLUE = "#2F6FDE";
const TT_PINK = "#F2416B";
const TT_CYAN = "#3ED6CF";
const IG_MAGENTA = "#C93A82";
const IG_ORANGE = "#F29A3E";
const IG_BLUE = "#3B82F0";
const LIKED = "#E8455A";

const followTags = ["follow", "following", "button", "social", "ෆලෝ", "ෆලෝ කරන්න", "பின்தொடர்"];
const fb = { category: "follow-facebook", loop: false, variants: LANGUAGES } as const;
const tt = { category: "follow-tiktok", loop: false, variants: LANGUAGES } as const;
const ig = { category: "follow-instagram", loop: false, variants: LANGUAGES } as const;
const fbTags = ["facebook", "fb", "page", ...followTags];
const ttTags = ["tiktok", "short video", "vertical", "reels", ...followTags];
const igTags = ["instagram", "insta", "ig", "story", ...followTags];

// ---------- icons (centred on the origin, about 200 px at scale 100) ----------

const heartPath = pathData(
	[[0, -42, -12, -34, 12, -34], [56, -94, -32, 0, 32, 0], [108, -32, 0, -38, 0, 44], [0, 92, 44, -40, -44, -40], [-108, -32, 0, 44, 0, -38], [-56, -94, 32, 0, -32, 0]],
	true,
);

/** A heart, filled or outlined. */
function heart(color: string, { outline, fillOpacity = 100 }: { outline?: number; fillOpacity?: number | Key[] } = {}): Shape[] {
	return [path(heartPath), outline ? stroke(color, outline) : fill(color, fillOpacity)];
}

/** A rounded speech bubble with a tail at the bottom left. */
function bubble(color: string, outline?: number, w = 210, h = 170): Shape[] {
	const tail = pathData([[-w * 0.3, h * 0.38], [-w * 0.42, h * 0.66], [-w * 0.05, h * 0.46]], true);
	return [path(roundRectPath(w, h, h * 0.42)), path(tail), outline ? stroke(color, outline) : fill(color)];
}

const bookmarkPath = pathData([[-62, -96], [62, -96], [62, 96], [0, 48], [-62, 96]], true);
function bookmark(color: string, { outline, fillOpacity = 100 }: { outline?: number; fillOpacity?: number | Key[] } = {}): Shape[] {
	return [path(bookmarkPath), outline ? stroke(color, outline) : fill(color, fillOpacity)];
}

/** A paper plane pointing up and right. */
function plane(color: string, outline = 18): Shape[] {
	return [path(pathData([[-104, -6], [104, -96], [36, 104], [4, 22]], true)), path(pathData([[4, 22], [104, -96]])), stroke(color, outline)];
}

/** A curved share arrow pointing right. */
function shareArrow(color: string): Shape[] {
	return [
		group([path(smoothLine([[-96, 92], [-66, 0], [36, -26]])), stroke(color, 42, { cap: "round" })], {}, "Tail"),
		group([path(pathData([[16, -104], [118, -26], [16, 52]], true)), stroke(color, 16), fill(color)], {}, "Head"),
	];
}

/** A plus sign. */
const plus = (color: string, size: number, weight: number): Shape[] => [
	group([rect([size, weight], [0, 0], weight / 2), fill(color)], {}, "Bar"),
	group([rect([weight, size], [0, 0], weight / 2), fill(color)], {}, "Bar"),
];

/** A person with a plus beside them (the generic "add friend" icon). */
function personPlus(color: string): Shape[] {
	return [
		group([ellipse([84, 84]), fill(color)], { position: [-36, -52] }, "Head"),
		group([path(pathData([[-118, 92], [-118, 52, 0, 0, 0, -50], [-36, 6, -50, 0, 50, 0], [46, 52, 0, -50, 0, 0], [46, 92]], true)), fill(color)], {}, "Body"),
		group(plus(color, 70, 22), { position: [98, -24] }, "Plus"),
	];
}

/** Two interlocking rounded links (a generic "link" icon). */
function chain(color: string): Shape[] {
	const link = (x: number) => group([rect([120, 70], [0, 0], 35), stroke(color, 20)], { position: [x, 0], rotation: -40 });
	return [link(-36), link(36)];
}

const chevron = (color: string, w = 120, weight = 22) => [path(pathData([[-w / 2, w / 4], [0, -w / 4], [w / 2, w / 4]])), stroke(color, weight)];

// ---------- words ----------

/** An optional icon then a word, centred; returns the shape (fading by `opacity`). */
function iconWord(
	ctx: AssetContext,
	word: string,
	{ cap, maxW, color, icon, iconSize, opacity = 100, at = [0, 0] }: { cap: number; maxW: number; color: string; icon?: Shape[]; iconSize?: number; opacity?: number | Key[]; at?: number[] },
): Shape {
	const iw = icon ? (iconSize ?? cap * 1.25) : 0;
	const gap = icon ? cap * 0.42 : 0;
	const key = `${lang(ctx)}.${word}`;
	const probe = label(key, { cap, maxW: maxW - iw - gap, color });
	const total = iw + gap + probe.w;
	const text = label(key, { cap, maxW: maxW - iw - gap, color, at: [-total / 2 + iw + gap + probe.w / 2, 0] }).shape;
	const items: Shape[] = [text];
	if (icon) items.push(group(icon, { position: [-total / 2 + iw / 2, 0], scale: [(iw / 230) * 100, (iw / 230) * 100] }, "Icon"));
	return group(items, { position: at, opacity }, `Word ${word}`);
}

/** A tick drawing on, then a word fading in: the "done" state. */
function doneWord(ctx: AssetContext, word: string, { at, cap, maxW, color, offset = [0, 0] }: { at: number; cap: number; maxW: number; color: string; offset?: number[] }): Shape {
	const tickW = cap * 0.95;
	const gap = cap * 0.4;
	const key = `${lang(ctx)}.${word}`;
	const probe = label(key, { cap, maxW: maxW - tickW - gap, color });
	const total = tickW + gap + probe.w;
	return group(
		[
			label(key, { cap, maxW: maxW - tickW - gap, color, at: [total / 2 - probe.w / 2, 0], opacity: fadeIn(at, 8) }).shape,
			tick(color, tickW, Math.max(6, cap * 0.22), [[at + 2, 0, EASE.out], [at + 14, 100]], [-total / 2 + tickW / 2, cap * 0.05]),
		],
		{ position: offset },
		`Done ${word}`,
	);
}

/**
 * A follow button (pill or rounded rect) that, pressed at `press`, takes its
 * pressed colour and swaps to a tick and "FOLLOWING". Layers, top first.
 */
function followButton(
	ctx: AssetContext,
	{
		at,
		w,
		h,
		cap,
		pop = 0,
		press,
		radius,
		icon = true,
		scale,
		shadow = true,
		colors = {},
	}: { at: number[]; w: number; h: number; cap: number; pop?: number; press?: number; radius?: number; icon?: boolean; scale?: Key[]; shadow?: boolean; colors?: { button?: string; pressed?: string; text?: string; pressedText?: string; shadow?: string } },
): LayerInput[] {
	const { c } = ctx;
	const col = { button: "button", pressed: "pressed", text: "text", pressedText: "text", shadow: "shadow", ...colors };
	const s = scale ?? popPress(pop, press);
	const r = radius ?? h / 2;
	const maxW = w - Math.min(h, r * 2) * 0.6 - 30;
	const swap = press !== undefined ? press + 3 : undefined;
	const shape = (color: string, opacity: number | Key[] = 100) => group([rect([w, h], [0, 0], r), fill(color, opacity)]);
	const layers: LayerInput[] = [
		{
			name: "Label",
			position: at,
			scale: s,
			shapes: [
				iconWord(ctx, "follow", { cap, maxW, color: c(col.text), icon: icon ? personPlus(c(col.text)) : undefined, opacity: swap !== undefined ? fadeOut(swap, 5) : 100 }),
				...(swap !== undefined ? [doneWord(ctx, "following", { at: swap + 3, cap: cap * 0.92, maxW, color: c(col.pressedText) })] : []),
			],
		},
	];
	if (swap !== undefined) layers.push({ name: "Pressed", position: at, scale: s, opacity: fadeIn(swap, 6), shapes: [shape(c(col.pressed))] });
	layers.push({ name: "Button", position: at, scale: s, shapes: [shape(c(col.button))] });
	if (shadow) layers.push({ name: "Shadow", position: [at[0], at[1] + h * 0.09], scale: s, shapes: [shape(c(col.shadow), 35)] });
	return layers;
}

/** A cursor that glides in, clicks at `click` and leaves. */
function cursor(c: (id: string) => string, { to, click, from = [to[0] + 420, to[1] + 260], fillSlot = "cursor", outlineSlot = "shadow" }: { to: number[]; click: number; from?: number[]; fillSlot?: string; outlineSlot?: string }): LayerInput {
	return {
		name: "Cursor",
		position: [[click - 28, from, EASE.inOut], [click - 4, to], [click + 26, to, EASE.in], [click + 50, from]],
		scale: [[0, [80, 80]], [click - 2, [80, 80], EASE.out], [click + 2, [72, 72], EASE.out], [click + 8, [80, 80]]],
		opacity: [[click - 28, 0, EASE.out], [click - 22, 100], [click + 40, 100, EASE.in], [click + 50, 0]],
		shapes: [path(cursorArrow), fill(c(fillSlot)), stroke(c(outlineSlot), 7)],
	};
}

/** Small hearts floating up and away from the origin. */
function floatHearts(color: string, start: number, count: number, seed: number, spread = 160): Shape[] {
	const rnd = seeded(seed);
	return Array.from({ length: count }, (_, i) => {
		const t = start + i * 3;
		const x = (rnd() - 0.5) * spread * 2;
		const y = -160 - rnd() * 160;
		const s = 18 + rnd() * 14;
		return group(heart(color), {
			position: [[t, [0, 0], EASE.out], [t + 30, [x, y]]],
			scale: [[t, [0, 0], EASE.back], [t + 8, [s, s]], [t + 22, [s, s], EASE.in], [t + 30, [0, 0]]],
			rotation: [[t, 0], [t + 30, (rnd() - 0.5) * 60]],
		});
	});
}

const grow = (t: number, len = 12): Key[] => [[t, [0, 100], EASE.out], [t + len, [100, 100]]];
/** A placeholder bar that grows from its left end. */
const bar = (color: string, w: number, h: number, at: number[], t: number, opacity = 100) => group([rect([w, h], [w / 2, 0], h / 2), fill(color, opacity)], { position: at, scale: grow(t) });

// ---------- Facebook-style ----------

export const followFacebook: AssetDef[] = [
	{
		...fb,
		w: 900,
		h: 300,
		id: "fb-follow-click",
		name: "Follow click",
		description: "A follow pill with a person-plus icon pops in, a cursor clicks it, and it turns grey with a tick and “Following”.",
		tags: [...fbTags, "click", "cursor", "pill"],
		durationSec: 3,
		thumbAt: 0.33,
		colors: [slot("button", "Button", FB_BLUE), slot("pressed", "Following button", GREY), slot("text", "Text & icon", WHITE), slot("cursor", "Cursor", SOFT), slot("shadow", "Shadow & outline", INK)],
		build: (ctx) => [cursor(ctx.c, { to: [560, 182], click: 42 }), { name: "Click ripple", position: [560, 182], shapes: [ripple(ctx.c("cursor"), 43, 140)] }, ...followButton(ctx, { at: [450, 150], w: 600, h: 150, cap: 48, press: 42 })],
	},
	{
		...fb,
		w: 1000,
		h: 440,
		id: "fb-page-card",
		name: "Page follow card",
		description: "A page card with an empty avatar circle and name and handle lines (cover them with your own picture and text); its follow button is pressed.",
		tags: [...fbTags, "card", "profile", "avatar", "page follow"],
		durationSec: 3.5,
		thumbAt: 0.85,
		colors: [slot("panel", "Card", INK), slot("placeholder", "Avatar & text area", MUTED), slot("button", "Button", FB_BLUE), slot("pressed", "Following button", GREY), slot("text", "Text", WHITE), slot("cover", "Cover strip", "#24324F")],
		build: (ctx) => {
			const { c } = ctx;
			const card = roundRectPath(920, 360, 36);
			return [
				...followButton(ctx, { at: [500, 330], w: 840, h: 96, cap: 34, pop: 22, press: 64, radius: 22, shadow: false }),
				{ name: "Name", position: [330, 168], shapes: [bar(c("placeholder"), 360, 34, [0, -22], 16), bar(c("placeholder"), 230, 22, [0, 26], 20, 55)] },
				{ name: "Avatar", position: [200, 168], scale: popPress(10), shapes: [group([ellipse([150, 150]), fill(c("placeholder"))]), group([ellipse([172, 172]), fill(c("panel"))])] },
				{ name: "Cover", position: [500, 220], masks: [card], scale: [[0, [92, 92], EASE.out], [14, [100, 100]]], opacity: fadeIn(0, 10), shapes: [group([rect([920, 120], [0, -120]), fill(c("cover"))])] },
				{ name: "Card", position: [500, 220], scale: [[0, [92, 92], EASE.out], [14, [100, 100]]], opacity: fadeIn(0, 10), shapes: [group([path(card), fill(c("panel"), 94)])] },
			];
		},
	},
	{
		...fb,
		w: 800,
		h: 800,
		id: "fb-like-burst",
		name: "Like burst with reactions",
		description: "A thumbs-up circle pops with a burst, three reaction bubbles (heart, thumb, star) bob up above it and a “Like” label appears.",
		tags: [...fbTags, "like", "thumbs up", "reaction", "burst", "ලයික්", "லைக்"],
		durationSec: 3,
		thumbAt: 0.55,
		colors: [slot("button", "Like circle", FB_BLUE), slot("text", "Icons & text", WHITE), slot("heart", "Heart bubble", LIKED), slot("star", "Star bubble", AMBER), slot("label", "Label pill", INK)],
		build: (ctx) => {
			const { c } = ctx;
			const reaction = (x: number, y: number, t: number, color: string, icon: Shape[]) =>
				group([...icon, group([ellipse([150, 150]), fill(c(color))]), group([ellipse([166, 166]), fill(c("text"))])], {
					position: [[t, [400, 380], EASE.back], [t + 14, [x, y], EASE.soft], [t + 34, [x, y - 14], EASE.soft], [t + 54, [x, y]]],
					scale: [[t, [0, 0], EASE.back], [t + 12, [100, 100]]],
				});
			const iconScale = (shapes: Shape[], s: number) => [group(shapes, { scale: [s, s] })];
			return [
				{
					name: "Reactions",
					position: [0, 0],
					shapes: [
						reaction(220, 200, 26, "heart", iconScale(heart(c("text")), 42)),
						reaction(400, 150, 30, "button", iconScale(thumb(c("text")), 34)),
						reaction(580, 200, 34, "star", [group([star({ points: 5, outer: 50, inner: 22, position: [0, 6] }), fill(c("text"))])]),
					],
				},
				{ name: "Label", position: [400, 650], scale: popPress(16), shapes: [iconWord(ctx, "like", { cap: 46, maxW: 300, color: c("text") }), pill(360, 110, c("label"), 90)] },
				{ name: "Burst", position: [400, 420], shapes: burst(c("button"), 10, { count: 10, r1: 150, r2: 210, width: 14 }) },
				{ name: "Thumb", position: [404, 420], scale: [[0, [0, 0], EASE.out], [8, [56, 56], EASE.inOut], [14, [44, 44], EASE.out], [20, [48, 48]]], rotation: [[0, -30, EASE.out], [12, 8, EASE.inOut], [20, 0]], shapes: thumb(c("text")) },
				{ name: "Circle", position: [400, 420], scale: popPress(0), shapes: [group([ellipse([240, 240]), fill(c("button"))])] },
			];
		},
	},
	{
		...fb,
		w: 900,
		h: 400,
		id: "fb-share-flyout",
		name: "Share fly-out",
		description: "A share button is tapped and its arrow flies out with a trail of dots, then swings back in.",
		tags: [...fbTags, "share", "arrow", "fly", "ෂෙයා", "பகிர்"],
		durationSec: 3,
		thumbAt: 0.9,
		colors: [slot("button", "Button", FB_BLUE), slot("text", "Text & arrow", WHITE), slot("accent", "Trail", AMBER), slot("shadow", "Shadow", INK)],
		build: (ctx) => {
			const { c } = ctx;
			const s = popPress(0, 30);
			const t = 34;
			const arrowPos: Key[] = [[t, [-170, 0], EASE.in], [t + 12, [330, -150], EASE.linear], [t + 13, [-470, 40], EASE.out], [t + 30, [-170, 0]]];
			const dots = [0, 1, 2, 3, 4].map((i) =>
				group([ellipse([18 - i * 2, 18 - i * 2]), fill(c("accent"))], {
					position: [-170 + i * 100, -i * 30],
					scale: [[t + 2 + i * 2, [0, 0], EASE.back], [t + 6 + i * 2, [100, 100], EASE.in], [t + 20 + i * 2, [0, 0]]],
				}),
			);
			const word = label(`${lang(ctx)}.share`, { cap: 46, maxW: 330, color: c("text") });
			return [
				{ name: "Trail", position: [450, 200], shapes: dots },
				{ name: "Arrow", position: [450, 200], scale: s, shapes: [group(shareArrow(c("text")), { position: arrowPos, scale: [[t, [36, 36]], [t + 12, [50, 50], EASE.linear], [t + 13, [36, 36]]], rotation: [[t, 0, EASE.in], [t + 12, -25, EASE.linear], [t + 13, 15, EASE.out], [t + 30, 0]] })] },
				{ name: "Label", position: [450, 200], scale: s, shapes: [group([word.shape], { position: [60, 0] })] },
				{ name: "Button", position: [450, 200], scale: s, masks: [roundRectPath(600, 150, 75)], shapes: [pill(600, 150, c("button"))] },
				{ name: "Shadow", position: [450, 214], scale: s, shapes: [pill(600, 150, c("shadow"), 35)] },
			];
		},
	},
	{
		...fb,
		w: 1600,
		h: 300,
		id: "fb-follow-lower-third",
		name: "Follow the page lower third",
		description: "A lower-third bar slides in with an empty text area for your page name and a follow button that gets pressed, then slides away.",
		tags: [...fbTags, "lower third", "bar", "page", "name"],
		durationSec: 4,
		thumbAt: 0.62,
		colors: [slot("panel", "Bar", INK), slot("placeholder", "Text area", MUTED), slot("accent", "Accent strip", AMBER), slot("button", "Button", FB_BLUE), slot("pressed", "Following button", GREY), slot("text", "Text", WHITE)],
		build: (ctx) => {
			const { c } = ctx;
			const slide = (y: number, t = 0): Key[] => [[t, [-900, y], EASE.out], [t + 18, [800, y]], [100, [800, y], EASE.in], [116, [2500, y]]];
			// The button rides on the bar: its own pop and press happen inside a group.
			const btn = followButton(ctx, { at: [0, 0], w: 420, h: 120, cap: 38, pop: 14, press: 62, shadow: false }).map(
				(l): LayerInput => ({ name: l.name, position: slide(150, 4), shapes: [group(l.shapes, { position: [480, 0], scale: l.scale ?? [100, 100], opacity: l.opacity ?? 100 })] }),
			);
			return [
				...btn,
				{ name: "Text area", position: slide(150, 2), shapes: [bar(c("placeholder"), 560, 44, [-640, -28], 18, 70), bar(c("placeholder"), 360, 26, [-640, 34], 22, 45)] },
				{ name: "Accent", position: slide(150), shapes: [group([rect([16, 170], [0, 0], 8), fill(c("accent"))], { position: [-700, 0], scale: [[12, [100, 0], EASE.out], [24, [100, 100]]] })] },
				{ name: "Bar", position: slide(150), shapes: [group([rect([1520, 220], [0, 0], 30), fill(c("panel"), 92)])] },
			];
		},
	},
	{
		...fb,
		w: 1000,
		h: 300,
		id: "fb-bell-follow",
		name: "Follow + bell",
		description: "The follow button is pressed, then a bell beside it rings with a wiggle and burst lines: follow and get notified.",
		tags: [...fbTags, "bell", "notification", "ring"],
		durationSec: 3.5,
		thumbAt: 0.62,
		colors: [slot("button", "Button", FB_BLUE), slot("pressed", "Following & bell circle", GREY), slot("text", "Text", WHITE), slot("accent", "Bell & burst", AMBER), slot("shadow", "Shadow", INK)],
		build: (ctx) => {
			const { c } = ctx;
			return [
				{ name: "Burst", position: [840, 150], shapes: burst(c("accent"), 56, { r1: 95, r2: 135, width: 10 }) },
				{ name: "Bell", position: [840, 104], scale: [[6, [0, 0], EASE.out], [16, [26, 26], EASE.inOut], [22, [23, 23]]], rotation: ringSwing(50), shapes: bell(c("accent")) },
				{ name: "Bell circle", position: [840, 150], scale: popPress(6, 48), shapes: [group([ellipse([140, 140]), fill(c("pressed"))])] },
				{ name: "Bell shadow", position: [840, 163], scale: popPress(6, 48), shapes: [group([ellipse([140, 140]), fill(c("shadow"), 35)])] },
				...followButton(ctx, { at: [400, 150], w: 600, h: 150, cap: 48, press: 26 }),
			];
		},
	},
];

// ---------- TikTok-style ----------

/** An empty avatar circle with a ring, and a plus badge that spins into a tick. */
function avatarPlus(c: (id: string) => string, { size, press, slots = {} }: { size: number; press: number; slots?: { avatar?: string; ring?: string; badge?: string; mark?: string; done?: string } }): Shape[] {
	const sl = { avatar: "avatar", ring: "ring", badge: "badge", mark: "mark", done: "done", ...slots };
	const b = size * 0.36;
	const badgeY = size / 2;
	return [
		group(
			[
				group(plus(c(sl.mark), b * 0.52, b * 0.14), { opacity: fadeOut(press + 2, 4) }, "Plus"),
				group([tick(c(sl.badge), b * 0.5, b * 0.13, [[press + 6, 0, EASE.out], [press + 16, 100]])], { rotation: 180 }, "Tick"),
				group([ellipse([b, b]), fill(c(sl.done), fadeIn(press + 2, 4))], {}, "Done disc"),
				group([ellipse([b, b]), fill(c(sl.badge))], {}, "Badge disc"),
			],
			{
				position: [0, badgeY],
				rotation: [[press, 0, EASE.out], [press + 12, 180]],
				scale: [[0, [0, 0]], [8, [0, 0], EASE.back], [18, [100, 100]], [press, [100, 100], EASE.out], [press + 4, [80, 80], EASE.back], [press + 14, [115, 115], EASE.inOut], [press + 22, [100, 100]], [press + 40, [100, 100], EASE.backIn], [press + 50, [0, 0]]],
			},
			"Badge",
		),
		group([ellipse([size, size]), fill(c(sl.avatar))], { scale: popPress(0) }, "Avatar"),
		group([ellipse([size + size * 0.1, size + size * 0.1]), fill(c(sl.ring))], { scale: popPress(0) }, "Ring"),
	];
}

const RAIL = { x: 200 } as const;

export const followTikTok: AssetDef[] = [
	{
		category: "follow-tiktok",
		loop: false,
		w: 500,
		h: 500,
		id: "tt-avatar-plus",
		name: "Avatar plus to tick",
		description: "The short-video follow: an empty avatar circle with a plus badge; tapped, the badge spins into a tick and tucks away. No words.",
		tags: [...ttTags, "avatar", "plus", "tick", "profile", "icon"],
		durationSec: 2.5,
		thumbAt: 0.25,
		colors: [slot("avatar", "Avatar area", MUTED), slot("ring", "Avatar ring", WHITE), slot("badge", "Plus badge", TT_PINK), slot("mark", "Plus", SOFT), slot("done", "Tick badge", "#FDFDFE"), slot("accent", "Ripple", TT_CYAN)],
		build: ({ c }) => [
			{ name: "Ripple", position: [250, 360], shapes: [ripple(c("accent"), 30, 200)] },
			{ name: "Avatar", position: [250, 220], shapes: avatarPlus(c, { size: 280, press: 28 }) },
		],
	},
	{
		category: "follow-tiktok",
		loop: false,
		w: 400,
		h: 1100,
		id: "tt-action-rail",
		name: "Side action rail",
		description: "A vertical rail of avatar-plus, heart, comment, bookmark and share buttons with empty count bars slides in; the heart is liked with a burst. Made for 9:16.",
		tags: [...ttTags, "rail", "side bar", "heart", "like", "comment", "bookmark", "share", "9:16"],
		durationSec: 3.5,
		thumbAt: 0.55,
		colors: [slot("icon", "Icons", WHITE), slot("liked", "Liked heart & badge", TT_PINK), slot("avatar", "Avatar area", MUTED), slot("count", "Count bars", "#C9CED8"), slot("accent", "Burst", TT_CYAN), slot("shadow", "Icon shadow", INK)],
		build: ({ c }) => {
			const x = RAIL.x;
			const slideIn = (y: number, t: number): Key[] => [[t, [x + 260, y], EASE.out], [t + 14, [x, y]]];
			const countBar = (t: number) => group([rect([90, 20], [0, 0], 10), fill(c("count"), 80)], { position: [0, 118], scale: [[t + 8, [0, 100], EASE.out], [t + 18, [100, 100]]] });
			const shadowed = (shapes: (color: string) => Shape[]) => [group(shapes(c("icon"))), group(shapes(c("shadow")), { position: [6, 8], opacity: 30 })];
			const like = 48;
			return [
				{ name: "Burst", position: [x, 380], shapes: burst(c("accent"), like + 2, { count: 8, r1: 80, r2: 115, width: 9 }) },
				{
					name: "Liked heart",
					position: slideIn(380, 6),
					shapes: [group(heart(c("liked")), { scale: [[like, [0, 0], EASE.back], [like + 8, [62, 62], EASE.inOut], [like + 14, [50, 50]]] })],
				},
				{ name: "Heart", position: slideIn(380, 6), shapes: [countBar(6), group(shadowed((col) => heart(col)), { scale: [[like - 4, [50, 50], EASE.out], [like, [42, 42], EASE.back], [like + 10, [50, 50]]] })] },
				{ name: "Comment", position: slideIn(590, 10), shapes: [countBar(10), group(shadowed((col) => bubble(col)), { scale: [44, 44] })] },
				{ name: "Bookmark", position: slideIn(790, 14), shapes: [countBar(14), group(shadowed((col) => bookmark(col)), { scale: [44, 44] })] },
				{ name: "Share", position: slideIn(990, 18), shapes: [group(shadowed((col) => shareArrow(col)), { scale: [42, 42] })] },
				{
					name: "Avatar",
					position: slideIn(170, 0),
					shapes: avatarPlus(c, { size: 150, press: 200, slots: { avatar: "avatar", ring: "icon", badge: "liked", mark: "icon", done: "icon" } }),
				},
			];
		},
	},
	{
		category: "follow-tiktok",
		loop: false,
		w: 800,
		h: 800,
		id: "tt-double-tap",
		name: "Double-tap heart",
		description: "Two quick tap ripples, then a big tilted heart pops, throws off little hearts and floats away. No words.",
		tags: [...ttTags, "double tap", "heart", "like", "love", "tap"],
		durationSec: 2.5,
		thumbAt: 0.32,
		colors: [slot("heart", "Heart", TT_PINK), slot("small", "Small hearts", "#FF8FA8"), slot("accent", "Taps & burst", WHITE), slot("shadow", "Shadow", INK)],
		build: ({ c }) => {
			const t = 16;
			const s: Key[] = [[t, [0, 0], EASE.back], [t + 8, [150, 150], EASE.inOut], [t + 14, [125, 125], EASE.soft], [t + 40, [130, 130], EASE.in], [t + 56, [70, 70]]];
			const pos: Key[] = [[t, [400, 420]], [t + 40, [400, 420], EASE.in], [t + 56, [400, 200]]];
			const op: Key[] = [[t + 42, 100, EASE.in], [t + 56, 0]];
			const rot: Key[] = [[t, -30, EASE.back], [t + 10, -12], [t + 40, -12, EASE.in], [t + 56, 0]];
			return [
				{ name: "Small hearts", position: [400, 420], shapes: floatHearts(c("small"), t + 6, 7, 31, 220) },
				{ name: "Burst", position: [400, 420], shapes: burst(c("accent"), t + 2, { count: 10, r1: 190, r2: 250, width: 12, offset: 18 }) },
				{ name: "Heart", position: pos, scale: s, rotation: rot, opacity: op, shapes: heart(c("heart")) },
				{ name: "Heart shadow", position: pos, scale: s, rotation: rot, opacity: [[t, 30], [t + 42, 30, EASE.in], [t + 56, 0]], shapes: [group(heart(c("shadow")), { position: [8, 14] })] },
				{ name: "Taps", position: [400, 420], shapes: [ripple(c("accent"), 2, 200), ripple(c("accent"), 9, 200)] },
			];
		},
	},
	{
		...tt,
		w: 900,
		h: 600,
		id: "tt-part2-sticker",
		name: "Follow for part 2 sticker",
		description: "A tilted sticker frame slaps on with an empty panel for your own “part 2” text, a big 2 badge and a follow button that pulses.",
		tags: [...ttTags, "part 2", "series", "sticker", "frame", "episode"],
		durationSec: 3,
		thumbAt: 0.5,
		colors: [slot("sticker", "Sticker", WHITE), slot("panel", "Text area", "#E7EAF0"), slot("button", "Button", TT_PINK), slot("text", "Button text", SOFT), slot("badge", "Badge", TT_CYAN), slot("digit", "Badge digit", INK), slot("shadow", "Shadow", "#0B0C10")],
		build: (ctx) => {
			const { c } = ctx;
			const rot: Key[] = [[0, -26, EASE.out], [10, -2, EASE.inOut], [18, -7, EASE.soft], [40, -5, EASE.soft], [70, -6]];
			const sc: Key[] = [[0, [160, 160], EASE.in], [8, [93, 93], EASE.out], [16, [103, 103], EASE.inOut], [24, [100, 100]]];
			const pulse: Key[] = [[30, [100, 100], EASE.soft], [40, [108, 108], EASE.soft], [50, [100, 100], EASE.soft], [60, [108, 108], EASE.soft], [70, [100, 100]]];
			const common = { position: [450, 300], rotation: rot, scale: sc, opacity: fadeIn(0, 4) };
			return [
				{ name: "Badge", ...common, shapes: [group([label("digit.2", { cap: 62, maxW: 80, color: c("digit") }).shape, group([ellipse([130, 130]), fill(c("badge"))])], { position: [300, -190], scale: [[14, [0, 0], EASE.back], [24, [100, 100]]], rotation: [[14, -90, EASE.out], [26, 0]] })] },
				{ name: "Button", ...common, shapes: [group([iconWord(ctx, "follow", { cap: 42, maxW: 400, color: c("text"), icon: personPlus(c("text")) }), pill(500, 116, c("button"))], { position: [0, 140], scale: pulse })] },
				{ name: "Panel", ...common, shapes: [group([rect([660, 220], [0, 0], 26), fill(c("panel"))], { position: [0, -50] })] },
				{ name: "Sticker", ...common, shapes: [group([rect([740, 480], [0, 0], 44), fill(c("sticker"))])] },
				{ name: "Shadow", position: [462, 318], rotation: rot, scale: sc, opacity: [[0, 0], [8, 30]], shapes: [group([rect([740, 480], [0, 0], 44), fill(c("shadow"))])] },
			];
		},
	},
	{
		category: "follow-tiktok",
		loop: true,
		w: 600,
		h: 900,
		id: "tt-swipe-up",
		name: "Swipe-up hint",
		description: "A touch dot swipes up a track while three chevrons light up in turn: a looping “swipe up / scroll for more” hint. No words.",
		tags: [...ttTags, "swipe up", "scroll", "hint", "gesture", "touch", "9:16"],
		durationSec: 2,
		thumbAt: 0.4,
		colors: [slot("chevron", "Chevrons", WHITE), slot("track", "Track", "#8A92A3"), slot("dot", "Touch dot", SOFT), slot("outline", "Touch ring", INK), slot("accent", "Trail", TT_CYAN)],
		build: ({ c }) => {
			const chev = (i: number) => {
				const t = 4 + i * 6;
				return group(chevron(c("chevron"), 120, 20), { position: [0, -i * 70], opacity: [[0, 25], [t, 25, EASE.out], [t + 6, 100, EASE.in], [t + 22, 25]] });
			};
			return [
				{
					name: "Touch",
					position: [[0, [300, 740], EASE.inOut], [26, [300, 360], EASE.in], [36, [300, 330]], [46, [300, 740]]],
					opacity: [[0, 0, EASE.out], [4, 100], [28, 100, EASE.in], [36, 0], [56, 0, EASE.out], [60, 0]],
					scale: [[0, [130, 130], EASE.out], [6, [90, 90]], [28, [90, 90], EASE.in], [36, [130, 130]]],
					shapes: [group([ellipse([70, 70]), fill(c("dot"), 90)]), group([ellipse([96, 96]), stroke(c("outline"), 8, { opacity: 40 })])],
				},
				{ name: "Trail", position: [300, 0], shapes: [group([path(pathData([[0, 740], [0, 360]])), trim([[6, 0, EASE.inOut], [32, 0, EASE.out], [40, 100]], [[0, 0, EASE.inOut], [26, 100]]), stroke(c("accent"), 18)])] },
				{ name: "Chevrons", position: [300, 330], shapes: [0, 1, 2].map(chev) },
				{ name: "Track", position: [300, 520], shapes: [group([rect([60, 560], [0, 0], 30), stroke(c("track"), 6, { opacity: 70 })])] },
			];
		},
	},
	{
		...tt,
		w: 1000,
		h: 500,
		id: "tt-comment-reply",
		name: "Comment reply + follow",
		description: "A comment-reply bubble with an empty avatar and empty lines for your own comment text pops up, and its follow button is tapped.",
		tags: [...ttTags, "comment", "reply", "bubble", "කමෙන්ට්", "கருத்து"],
		durationSec: 3.5,
		thumbAt: 0.85,
		colors: [slot("bubble", "Bubble", WHITE), slot("placeholder", "Avatar & text area", "#C4C9D3"), slot("chip", "Comment tag", INK), slot("button", "Button", TT_PINK), slot("pressed", "Following button", GREY), slot("text", "Text", SOFT), slot("shadow", "Shadow", "#0B0C10")],
		build: (ctx) => {
			const { c } = ctx;
			const shape = roundRectPath(880, 300, 40);
			const tail = pathData([[-320, 140], [-380, 220], [-230, 150]], true);
			const pop: Key[] = [[0, [0, 0], EASE.back], [14, [100, 100]]];
			return [
				...followButton(ctx, { at: [790, 330], w: 230, h: 76, cap: 26, pop: 18, press: 62, shadow: false }),
				{ name: "Chip", position: [210, 82], scale: [[8, [0, 0], EASE.back], [18, [100, 100]]], shapes: [iconWord(ctx, "comment", { cap: 26, maxW: 200, color: c("text"), icon: bubble(c("text")), iconSize: 34 }), pill(260, 64, c("chip"))] },
				{ name: "Lines", position: [500, 250], shapes: [bar(c("placeholder"), 520, 30, [-250, -36], 12), bar(c("placeholder"), 380, 30, [-250, 20], 16), bar(c("placeholder"), 200, 22, [-250, 76], 20, 60)] },
				{ name: "Avatar", position: [160, 230], scale: popPress(8), shapes: [group([ellipse([110, 110]), fill(c("placeholder"))])] },
				// Scaled from the tail tip, so the bubble grows out of it.
				{ name: "Bubble", position: [180, 400], scale: pop, shapes: [group([path(shape), path(tail), fill(c("bubble"))], { position: [320, -150] })] },
				{ name: "Shadow", position: [188, 414], scale: pop, opacity: 30, shapes: [group([path(shape), path(tail), fill(c("shadow"))], { position: [320, -150] })] },
			];
		},
	},
];

// ---------- Instagram-style ----------

export const followInstagram: AssetDef[] = [
	{
		...ig,
		w: 900,
		h: 300,
		id: "ig-follow-toggle",
		name: "Follow to following",
		description: "A rounded follow button is tapped with a ripple, squashes, and settles as a quiet “Following” button with a tick.",
		tags: [...igTags, "toggle", "tap", "rounded"],
		durationSec: 2.5,
		thumbAt: 0.25,
		colors: [slot("button", "Button", IG_BLUE), slot("pressed", "Following button", "#2C3038"), slot("text", "Text", WHITE), slot("accent", "Ripple", IG_ORANGE), slot("shadow", "Shadow", INK)],
		build: (ctx) => [
			{ name: "Ripple", position: [450, 150], shapes: [ripple(ctx.c("accent"), 31, 300)] },
			...followButton(ctx, { at: [450, 150], w: 560, h: 130, cap: 46, press: 28, radius: 30, icon: false }),
		],
	},
	{
		...ig,
		w: 1000,
		h: 560,
		id: "ig-profile-card",
		name: "Profile header card",
		description: "A profile header with an empty avatar circle, three empty stat placeholders and a wide follow button that gets pressed. Cover the placeholders with your own picture and numbers.",
		tags: [...igTags, "profile", "header", "card", "avatar", "stats", "followers"],
		durationSec: 3.5,
		thumbAt: 0.85,
		colors: [slot("panel", "Card", INK), slot("placeholder", "Avatar & stats", MUTED), slot("ring", "Avatar ring", IG_MAGENTA), slot("button", "Button", IG_BLUE), slot("pressed", "Following button", GREY), slot("text", "Text", WHITE)],
		build: (ctx) => {
			const { c } = ctx;
			const stat = (x: number, t: number) =>
				group([bar(c("placeholder"), 110, 44, [-55, -26], t), bar(c("placeholder"), 150, 22, [-75, 30], t + 4, 55)], { position: [x, 0], opacity: fadeIn(t, 6) });
			return [
				...followButton(ctx, { at: [500, 440], w: 860, h: 96, cap: 34, pop: 24, press: 66, radius: 22, shadow: false }),
				{ name: "Stats", position: [0, 200], shapes: [stat(470, 14), stat(650, 18), stat(830, 22)] },
				{ name: "Ring", position: [200, 200], shapes: [group([ellipse([210, 210]), trim(0, [[6, 0, EASE.inOut], [30, 100]]), stroke(c("ring"), 10)], { rotation: -90 })] },
				{ name: "Avatar", position: [200, 200], scale: popPress(6), shapes: [group([ellipse([180, 180]), fill(c("placeholder"))])] },
				{ name: "Card", position: [500, 280], scale: [[0, [94, 94], EASE.out], [14, [100, 100]]], opacity: fadeIn(0, 10), shapes: [group([rect([940, 520], [0, 0], 40), fill(c("panel"), 92)])] },
			];
		},
	},
	{
		...ig,
		w: 800,
		h: 400,
		id: "ig-story-sticker",
		name: "Story tap sticker",
		description: "A story-style sticker with a person-plus icon and “Follow” drops in tilted, wobbles, is tapped and flips to “Following”.",
		tags: [...igTags, "sticker", "tap", "tilt", "story sticker"],
		durationSec: 3,
		thumbAt: 0.32,
		colors: [slot("sticker", "Sticker", WHITE), slot("text", "Text & icon", IG_MAGENTA), slot("done", "Following text", "#2E9E6A"), slot("accent", "Tap ring", IG_ORANGE), slot("shadow", "Shadow", INK)],
		build: (ctx) => {
			const { c } = ctx;
			const press = 46;
			const rot: Key[] = [[0, 24, EASE.out], [10, -8, EASE.inOut], [18, -2, EASE.inOut], [26, -5, EASE.soft], [press, -5, EASE.out], [press + 6, 2, EASE.inOut], [press + 16, -4]];
			const sc: Key[] = [[0, [0, 0], EASE.back], [12, [100, 100]], [press, [100, 100], EASE.out], [press + 4, [90, 90], EASE.back], [press + 16, [100, 100]]];
			const common = { position: [400, 200], rotation: rot, scale: sc };
			return [
				{ name: "Tap", position: [430, 230], shapes: [ripple(c("accent"), press + 1, 240)] },
				{
					name: "Label",
					...common,
					shapes: [
						iconWord(ctx, "follow", { cap: 50, maxW: 480, color: c("text"), icon: personPlus(c("text")), opacity: fadeOut(press + 3, 5) }),
						doneWord(ctx, "following", { at: press + 6, cap: 44, maxW: 500, color: c("done") }),
					],
				},
				{ name: "Sticker", ...common, shapes: [group([rect([580, 170], [0, 0], 36), fill(c("sticker"))])] },
				{ name: "Shadow", ...common, position: [408, 214], opacity: 30, shapes: [group([rect([580, 170], [0, 0], 36), fill(c("shadow"))])] },
			];
		},
	},
	{
		category: "follow-instagram",
		loop: false,
		w: 1000,
		h: 300,
		id: "ig-action-row",
		name: "Heart, comment, share, save row",
		description: "A feed-style row of heart, comment, paper-plane share and bookmark icons pops in; the heart is liked, then the bookmark is saved. No words.",
		tags: [...igTags, "heart", "like", "comment", "share", "save", "bookmark", "action row"],
		durationSec: 3.5,
		thumbAt: 0.8,
		colors: [slot("icon", "Icons", WHITE), slot("liked", "Liked heart", IG_MAGENTA), slot("saved", "Saved bookmark", IG_ORANGE), slot("accent", "Burst", AMBER), slot("bar", "Bar", INK)],
		build: ({ c }) => {
			const pop = (t: number): Key[] => [[t, [0, 0], EASE.back], [t + 12, [100, 100]]];
			const like = 34;
			const save = 70;
			const tapScale = (t: number, s: number): Key[] => [[0, [s, s]], [t, [s, s], EASE.out], [t + 4, [s * 0.82, s * 0.82], EASE.back], [t + 14, [s, s]]];
			return [
				{ name: "Like burst", position: [140, 150], shapes: burst(c("accent"), like + 2, { count: 8, r1: 72, r2: 100, width: 8 }) },
				{ name: "Save burst", position: [860, 150], shapes: burst(c("accent"), save + 2, { count: 8, r1: 72, r2: 100, width: 8, offset: 22 }) },
				{ name: "Heart", position: [140, 150], scale: pop(4), shapes: [group(heart(c("liked"), { fillOpacity: fadeIn(like, 3) }), { scale: tapScale(like, 44) }), group(heart(c("icon"), { outline: 18 }), { scale: tapScale(like, 44), opacity: fadeOut(like, 3) })] },
				{ name: "Comment", position: [290, 150], scale: pop(8), shapes: [group(bubble(c("icon"), 18), { scale: [44, 44] })] },
				{ name: "Share", position: [440, 150], scale: pop(12), shapes: [group(plane(c("icon"), 18), { scale: [42, 42] })] },
				{ name: "Bookmark", position: [860, 150], scale: pop(16), shapes: [group(bookmark(c("saved"), { fillOpacity: fadeIn(save, 3) }), { scale: tapScale(save, 46) }), group(bookmark(c("icon"), { outline: 18 }), { scale: tapScale(save, 46), opacity: fadeOut(save, 3) })] },
				{ name: "Bar", position: [500, 150], scale: [[0, [0, 100], EASE.out], [14, [100, 100]]], shapes: [group([rect([960, 200], [0, 0], 100), fill(c("bar"), 80)])] },
			];
		},
	},
	{
		...ig,
		loop: true,
		w: 900,
		h: 360,
		id: "ig-link-in-bio",
		name: "Link in bio pointer",
		description: "A pill with a link icon and “Link in bio”, with an arrow above it bouncing upwards to point at your bio. Loops.",
		tags: [...igTags, "link in bio", "bio", "link", "pointer", "arrow", "බයෝ", "பயோ"],
		durationSec: 2,
		thumbAt: 0.5,
		colors: [slot("button", "Pill", IG_MAGENTA), slot("text", "Text & icon", WHITE), slot("arrow", "Arrow", IG_ORANGE), slot("shadow", "Shadow", INK)],
		build: (ctx) => {
			const { c } = ctx;
			const bob: Key[] = [[0, [450, 92], EASE.soft], [15, [450, 52], EASE.soft], [30, [450, 92], EASE.soft], [45, [450, 52], EASE.soft], [60, [450, 92]]];
			const breathe: Key[] = [[0, [100, 100], EASE.soft], [15, [104, 104], EASE.soft], [30, [100, 100], EASE.soft], [45, [104, 104], EASE.soft], [60, [100, 100]]];
			return [
				{ name: "Arrow", position: bob, shapes: [group([path(pathData([[0, -50], [0, 50]])), stroke(c("arrow"), 22)]), group(chevron(c("arrow"), 90, 22), { position: [0, -36] })] },
				{ name: "Label", position: [450, 250], scale: breathe, shapes: [iconWord(ctx, "linkinbio", { cap: 42, maxW: 620, color: c("text"), icon: chain(c("text")), iconSize: 62 })] },
				{ name: "Pill", position: [450, 250], scale: breathe, shapes: [pill(720, 130, c("button"))] },
				{ name: "Shadow", position: [450, 262], scale: breathe, shapes: [pill(720, 130, c("shadow"), 35)] },
			];
		},
	},
	{
		...ig,
		w: 600,
		h: 600,
		id: "ig-save-pop",
		name: "Save bookmark pop",
		description: "An outlined bookmark is tapped, fills with colour, pops with a burst and a “Save” label slides up under it.",
		tags: [...igTags, "save", "bookmark", "saved", "pop", "සේව්", "சேமி"],
		durationSec: 2.5,
		thumbAt: 0.7,
		colors: [slot("icon", "Bookmark outline & text", WHITE), slot("saved", "Saved fill", IG_ORANGE), slot("disc", "Circle & label", INK), slot("accent", "Burst", IG_MAGENTA)],
		build: (ctx) => {
			const { c } = ctx;
			const t = 24;
			const sc: Key[] = [[0, [0, 0], EASE.back], [12, [100, 100]], [t, [100, 100], EASE.out], [t + 4, [80, 80], EASE.back], [t + 14, [112, 112], EASE.inOut], [t + 22, [100, 100]]];
			return [
				{ name: "Label", position: [[t + 10, [300, 560], EASE.out], [t + 22, [300, 520]]], opacity: fadeIn(t + 10, 8), shapes: [iconWord(ctx, "save", { cap: 36, maxW: 260, color: c("icon") }), pill(300, 80, c("disc"), 90)] },
				{ name: "Burst", position: [300, 260], shapes: burst(c("accent"), t + 4, { count: 10, r1: 150, r2: 200, width: 12 }) },
				{ name: "Bookmark", position: [300, 260], scale: sc, shapes: [group(bookmark(c("saved"), { fillOpacity: fadeIn(t + 2, 4) }), { scale: [90, 90] }), group(bookmark(c("icon"), { outline: 16 }), { scale: [90, 90] })] },
				{ name: "Circle", position: [300, 260], scale: popPress(0, t), shapes: [group([ellipse([300, 300]), fill(c("disc"))])] },
			];
		},
	},
];
