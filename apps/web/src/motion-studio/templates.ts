/**
 * Built-in motion templates: original designs made from Motion Studio
 * layers, so every colour, word, font, shape and keyframe stays editable.
 * Using one makes a new project from it; users can save their own.
 */

import {
	ANIMATABLE,
	createMotionProject,
	DEFAULT_PLAYBACK,
	EASES,
	newId,
	type AnimProp,
	type Ease,
	type Layer,
	type MotionProject,
	type PathPoint,
} from "./model";

export const TEMPLATE_CATEGORIES = [
	"Animated Titles",
	"Lower Thirds",
	"Logo Animations",
	"Social Media Graphics",
	"Subscribe & Like",
	"Call-to-Action Buttons",
	"Transitions",
	"Infographics",
	"Loading Animations",
	"Animated Stickers",
	"Intro & Outro",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface MotionTemplate {
	id: string;
	name: string;
	category: TemplateCategory | "My templates";
	tags: string[];
	build: () => MotionProject;
}

const BACK: Ease = [0.34, 1.56, 0.64, 1];
const OUT = EASES.easeOut;
const IN = EASES.easeIn;
const IO = EASES.easeInOut;

type Track = Array<[number, number, Ease?]>;

function base(): Omit<Extract<Layer, { kind: "rect" }>, "kind" | "w" | "h" | "radius" | "fill" | "stroke" | "strokeWidth"> {
	return { id: newId(), name: "", visible: true, locked: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, keyframes: {} };
}

function animate<T extends Layer>({ layer, tracks }: { layer: T; tracks: Partial<Record<AnimProp, Track>> }): T {
	const keyframes = { ...layer.keyframes };
	for (const prop of ANIMATABLE) {
		const track = tracks[prop];
		if (track) keyframes[prop] = track.map(([t, v, ease]) => ({ t, v, ease: ease ?? IO }));
	}
	return { ...layer, keyframes };
}

interface Common {
	name: string;
	x: number;
	y: number;
	anim?: Partial<Record<AnimProp, Track>>;
	anchorX?: number;
	anchorY?: number;
	rotation?: number;
}

const rect = ({ w, h, fill, radius = 0, stroke = null, strokeWidth = 0, ...c }: Common & { w: number; h: number; fill: string | null; radius?: number; stroke?: string | null; strokeWidth?: number }): Layer =>
	animate({
		layer: { ...base(), name: c.name, x: c.x, y: c.y, rotation: c.rotation ?? 0, anchorX: c.anchorX ?? 0.5, anchorY: c.anchorY ?? 0.5, kind: "rect", w, h, radius, fill, stroke, strokeWidth },
		tracks: c.anim ?? {},
	});

const ellipse = ({ w, h, fill, stroke = null, strokeWidth = 0, ...c }: Common & { w: number; h: number; fill: string | null; stroke?: string | null; strokeWidth?: number }): Layer =>
	animate({
		layer: { ...base(), name: c.name, x: c.x, y: c.y, rotation: c.rotation ?? 0, anchorX: c.anchorX ?? 0.5, anchorY: c.anchorY ?? 0.5, kind: "ellipse", w, h, fill, stroke, strokeWidth },
		tracks: c.anim ?? {},
	});

const text = ({ text: content, size, fill = "#FFFFFF", weight = 800, font = "Inter", ...c }: Common & { text: string; size: number; fill?: string; weight?: number; font?: string }): Layer =>
	animate({
		layer: {
			...base(),
			name: c.name,
			x: c.x,
			y: c.y,
			rotation: c.rotation ?? 0,
			anchorX: c.anchorX ?? 0.5,
			anchorY: c.anchorY ?? 0.5,
			kind: "text",
			text: content,
			fontSize: size,
			fontFamily: font,
			fontWeight: weight,
			fill,
		},
		tracks: c.anim ?? {},
	});

const path = ({ points, closed = true, fill, stroke = null, strokeWidth = 0, ...c }: Common & { points: PathPoint[]; closed?: boolean; fill: string | null; stroke?: string | null; strokeWidth?: number }): Layer =>
	animate({
		layer: { ...base(), name: c.name, x: c.x, y: c.y, rotation: c.rotation ?? 0, anchorX: c.anchorX ?? 0.5, anchorY: c.anchorY ?? 0.5, kind: "path", points, closed, fill, stroke, strokeWidth },
		tracks: c.anim ?? {},
	});

function starPoints({ size, inner = 0.42, spikes = 5 }: { size: number; inner?: number; spikes?: number }): PathPoint[] {
	const pts: PathPoint[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const r = i % 2 ? (size / 2) * inner : size / 2;
		const a = (Math.PI / spikes) * i - Math.PI / 2;
		pts.push({ x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a) });
	}
	return pts;
}

const heartPoints = (s: number): PathPoint[] => [
	{ x: s / 2, y: s * 0.95, in: { x: s * 0.1, y: -s * 0.1 }, out: { x: -s * 0.1, y: -s * 0.1 } },
	{ x: 0, y: s * 0.32, in: { x: 0, y: s * 0.3 }, out: { x: 0, y: -s * 0.22 } },
	{ x: s / 2, y: s * 0.22, in: { x: -s * 0.3, y: -s * 0.3 }, out: { x: s * 0.3, y: -s * 0.3 } },
	{ x: s, y: s * 0.32, in: { x: 0, y: -s * 0.22 }, out: { x: 0, y: s * 0.3 } },
];

const playPoints = (s: number): PathPoint[] => [
	{ x: 0, y: 0 },
	{ x: s, y: s / 2 },
	{ x: 0, y: s },
];

const thumbPoints = (s: number): PathPoint[] => [
	{ x: s * 0.3, y: s * 0.95 },
	{ x: s * 0.3, y: s * 0.45 },
	{ x: s * 0.55, y: s * 0.05, in: { x: -s * 0.05, y: s * 0.15 } },
	{ x: s * 0.68, y: s * 0.18, in: { x: 0, y: -s * 0.12 } },
	{ x: s * 0.62, y: s * 0.4 },
	{ x: s * 0.95, y: s * 0.42, in: { x: 0, y: -s * 0.05 }, out: { x: 0, y: s * 0.05 } },
	{ x: s * 0.85, y: s * 0.95 },
];

function project({ name, width = 1920, height = 1080, duration = 4, background = null, layers }: { name: string; width?: number; height?: number; duration?: number; background?: string | null; layers: Layer[] }): MotionProject {
	const p = createMotionProject({ name, width, height, fps: 30, duration });
	p.background = background;
	p.layers = layers;
	p.playback = { ...DEFAULT_PLAYBACK };
	return p;
}

/** Pops in with a slight overshoot at `t`. */
const popIn = (t: number): Partial<Record<AnimProp, Track>> => ({
	scale: [
		[t, 0, BACK],
		[t + 0.5, 1],
	],
	opacity: [
		[t, 0, OUT],
		[t + 0.2, 1],
	],
});
/** Slides from `from` to `to` on x (or y) from `t`, fading in. */
const slide = ({ prop, from, to, t, d = 0.6 }: { prop: "x" | "y"; from: number; to: number; t: number; d?: number }): Partial<Record<AnimProp, Track>> => ({
	[prop]: [
		[t, from, OUT],
		[t + d, to],
	],
	opacity: [
		[t, 0, OUT],
		[t + d * 0.6, 1],
	],
});
const fadeOut = (t: number): Track => [
	[t, 1, IN],
	[t + 0.4, 0],
];

const W = 1920;
const H = 1080;

export const BUILT_IN_TEMPLATES: MotionTemplate[] = [
	// Animated titles
	{
		id: "title-bold-pop",
		name: "Bold pop title",
		category: "Animated Titles",
		tags: ["headline", "big", "pop"],
		build: () =>
			project({
				name: "Bold pop title",
				background: "#0F172A",
				layers: [
					rect({ name: "Bar", x: W / 2, y: H / 2 + 90, w: 640, h: 16, fill: "#22D3EE", anim: { scale: [[0.3, 0, OUT], [0.9, 1]] } }),
					text({ name: "Title", text: "YOUR BIG TITLE", size: 140, x: W / 2, y: H / 2 - 20, anim: popIn(0) }),
					text({ name: "Subtitle", text: "a short line under it", size: 44, weight: 500, fill: "#94A3B8", x: W / 2, y: H / 2 + 160, anim: slide({ prop: "y", from: H / 2 + 220, to: H / 2 + 160, t: 0.6 }) }),
				],
			}),
	},
	{
		id: "title-slide-stack",
		name: "Stacked slide title",
		category: "Animated Titles",
		tags: ["two lines", "slide", "clean"],
		build: () =>
			project({
				name: "Stacked slide title",
				layers: [
					text({ name: "Line 1", text: "MAKE IT", size: 120, weight: 900, x: W / 2, y: H / 2 - 70, anim: slide({ prop: "x", from: W / 2 - 300, to: W / 2, t: 0 }) }),
					text({ name: "Line 2", text: "HAPPEN", size: 120, weight: 900, fill: "#F59E0B", x: W / 2, y: H / 2 + 70, anim: slide({ prop: "x", from: W / 2 + 300, to: W / 2, t: 0.25 }) }),
				],
			}),
	},
	// Lower thirds
	{
		id: "lower-third-classic",
		name: "Classic lower third",
		category: "Lower Thirds",
		tags: ["name", "title", "role", "interview"],
		build: () =>
			project({
				name: "Classic lower third",
				duration: 5,
				layers: [
					rect({ name: "Accent", x: 140, y: 860, w: 14, h: 130, fill: "#22D3EE", anchorX: 0, anim: { scale: [[0, 0, BACK], [0.4, 1]], opacity: fadeOut(4.4) } }),
					rect({ name: "Name plate", x: 170, y: 830, w: 620, h: 80, fill: "#2563EB", anchorX: 0, anim: { ...slide({ prop: "x", from: 70, to: 170, t: 0.2 }), opacity: [[0.2, 0], [0.5, 1], [4.4, 1, IN], [4.8, 0]] } }),
					text({ name: "Name", text: "Alex Perera", size: 52, x: 200, y: 830, anchorX: 0, anim: { ...slide({ prop: "x", from: 120, to: 200, t: 0.35 }), opacity: [[0.35, 0], [0.7, 1], [4.4, 1, IN], [4.8, 0]] } }),
					rect({ name: "Role plate", x: 170, y: 905, w: 420, h: 56, fill: "#FFFFFF", anchorX: 0, anim: { ...slide({ prop: "x", from: 90, to: 170, t: 0.45 }), opacity: [[0.45, 0], [0.75, 1], [4.4, 1, IN], [4.8, 0]] } }),
					text({ name: "Role", text: "Product designer", size: 32, weight: 600, fill: "#0F172A", x: 195, y: 905, anchorX: 0, anim: { opacity: [[0.6, 0], [0.9, 1], [4.4, 1, IN], [4.8, 0]] } }),
				],
			}),
	},
	{
		id: "lower-third-minimal",
		name: "Minimal line lower third",
		category: "Lower Thirds",
		tags: ["minimal", "line", "news"],
		build: () =>
			project({
				name: "Minimal line lower third",
				duration: 5,
				layers: [
					rect({ name: "Line", x: 160, y: 900, w: 520, h: 4, fill: "#FFFFFF", anchorX: 0, anim: { scale: [[0, 0, OUT], [0.6, 1]], opacity: fadeOut(4.5) } }),
					text({ name: "Headline", text: "Breaking update", size: 56, x: 160, y: 850, anchorX: 0, anim: { ...slide({ prop: "y", from: 880, to: 850, t: 0.3 }), opacity: [[0.3, 0], [0.6, 1], [4.5, 1, IN], [4.9, 0]] } }),
					text({ name: "Detail", text: "Colombo · 10:30 AM", size: 30, weight: 500, fill: "#CBD5E1", x: 160, y: 940, anchorX: 0, anim: { opacity: [[0.6, 0], [0.9, 1], [4.5, 1, IN], [4.9, 0]] } }),
				],
			}),
	},
	// Logo animations
	{
		id: "logo-ring-reveal",
		name: "Ring logo reveal",
		category: "Logo Animations",
		tags: ["brand", "reveal", "circle"],
		build: () =>
			project({
				name: "Ring logo reveal",
				background: "#020617",
				layers: [
					ellipse({ name: "Ring", x: W / 2, y: H / 2 - 40, w: 300, h: 300, fill: null, stroke: "#22D3EE", strokeWidth: 14, anim: { scale: [[0, 0.2, BACK], [0.7, 1]], rotation: [[0, -90, OUT], [1.2, 0]], opacity: [[0, 0], [0.3, 1]] } }),
					ellipse({ name: "Logo mark", x: W / 2, y: H / 2 - 40, w: 200, h: 200, fill: "#2563EB", anim: popIn(0.5) }),
					text({ name: "Initials", text: "FF", size: 96, x: W / 2, y: H / 2 - 40, anim: popIn(0.8) }),
					text({ name: "Brand name", text: "FrameFlow", size: 72, weight: 700, x: W / 2, y: H / 2 + 190, anim: slide({ prop: "y", from: H / 2 + 240, to: H / 2 + 190, t: 1.1 }) }),
				],
			}),
	},
	{
		id: "logo-spin-star",
		name: "Spin and settle",
		category: "Logo Animations",
		tags: ["spin", "star", "playful"],
		build: () =>
			project({
				name: "Spin and settle",
				layers: [
					path({ name: "Star", x: W / 2, y: H / 2 - 30, points: starPoints({ size: 260 }), fill: "#F59E0B", anim: { rotation: [[0, -360, OUT], [1.2, 0]], scale: [[0, 0, BACK], [0.8, 1]] } }),
					text({ name: "Brand", text: "STARLIGHT", size: 80, x: W / 2, y: H / 2 + 170, anim: popIn(0.9) }),
				],
			}),
	},
	// Social media
	{
		id: "social-story-promo",
		name: "Story promo",
		category: "Social Media Graphics",
		tags: ["story", "reels", "vertical", "sale"],
		build: () =>
			project({
				name: "Story promo",
				width: 1080,
				height: 1920,
				duration: 5,
				background: "#1E1B4B",
				layers: [
					ellipse({ name: "Glow", x: 540, y: 700, w: 900, h: 900, fill: "#4F46E5", anim: { scale: [[0, 0.8], [5, 1.1]], opacity: [[0, 0], [0.6, 0.7]] } }),
					text({ name: "Kicker", text: "THIS WEEK ONLY", size: 54, weight: 700, fill: "#A5B4FC", x: 540, y: 520, anim: slide({ prop: "y", from: 580, to: 520, t: 0.2 }) }),
					text({ name: "Offer", text: "50% OFF", size: 200, weight: 900, x: 540, y: 720, anim: popIn(0.5) }),
					rect({ name: "Button", x: 540, y: 1100, w: 560, h: 130, radius: 65, fill: "#F59E0B", anim: popIn(1) }),
					text({ name: "Button text", text: "Shop now", size: 60, fill: "#1E1B4B", x: 540, y: 1100, anim: popIn(1.1) }),
				],
			}),
	},
	{
		id: "social-quote",
		name: "Quote card",
		category: "Social Media Graphics",
		tags: ["quote", "square", "post"],
		build: () =>
			project({
				name: "Quote card",
				width: 1080,
				height: 1080,
				background: "#FAFAF9",
				layers: [
					text({ name: "Quote mark", text: "“", size: 300, fill: "#F43F5E", x: 540, y: 300, anim: popIn(0) }),
					text({ name: "Quote", text: "Small steps\nevery day.", size: 96, weight: 800, fill: "#0F172A", x: 540, y: 560, anim: slide({ prop: "y", from: 600, to: 560, t: 0.4 }) }),
					text({ name: "Author", text: "— Your name", size: 44, weight: 500, fill: "#64748B", x: 540, y: 820, anim: { opacity: [[0.9, 0], [1.3, 1]] } }),
				],
			}),
	},
	// Subscribe & like
	{
		id: "subscribe-pill",
		name: "Subscribe pill",
		category: "Subscribe & Like",
		tags: ["youtube", "subscribe", "bell"],
		build: () =>
			project({
				name: "Subscribe pill",
				duration: 4,
				layers: [
					rect({ name: "Button", x: W / 2, y: H / 2, w: 520, h: 130, radius: 65, fill: "#DC2626", anim: { ...popIn(0), scale: [[0, 0, BACK], [0.5, 1], [1.6, 1, IO], [1.75, 0.92], [1.9, 1]] } }),
					text({ name: "Label", text: "SUBSCRIBE", size: 64, x: W / 2, y: H / 2, anim: popIn(0.15) }),
					path({ name: "Cursor", x: W / 2 + 240, y: H / 2 + 120, points: playPoints(70), fill: "#FFFFFF", rotation: -30, anim: { x: [[0.6, W / 2 + 420, OUT], [1.5, W / 2 + 170]], y: [[0.6, H / 2 + 260, OUT], [1.5, H / 2 + 60]], opacity: [[0.6, 0], [0.8, 1], [3.3, 1], [3.6, 0]] } }),
				],
			}),
	},
	{
		id: "like-heart-burst",
		name: "Like heart burst",
		category: "Subscribe & Like",
		tags: ["like", "heart", "love"],
		build: () =>
			project({
				name: "Like heart burst",
				duration: 3,
				layers: [
					ellipse({ name: "Burst ring", x: W / 2, y: H / 2, w: 360, h: 360, fill: null, stroke: "#F43F5E", strokeWidth: 10, anim: { scale: [[0.4, 0.3, OUT], [1.1, 1.3]], opacity: [[0.4, 1, IN], [1.1, 0]] } }),
					path({ name: "Heart", x: W / 2, y: H / 2, points: heartPoints(240), fill: "#F43F5E", anim: { scale: [[0, 0, BACK], [0.5, 1.15], [0.8, 1]] } }),
					rect({ name: "Thumb badge", x: W / 2 + 150, y: H / 2 - 120, w: 120, h: 120, radius: 60, fill: "#2563EB", anim: popIn(0.9) }),
					path({ name: "Thumb", x: W / 2 + 150, y: H / 2 - 120, points: thumbPoints(70), fill: "#FFFFFF", anim: popIn(1) }),
				],
			}),
	},
	// Call to action
	{
		id: "cta-learn-more",
		name: "Learn more button",
		category: "Call-to-Action Buttons",
		tags: ["button", "link", "website"],
		build: () =>
			project({
				name: "Learn more button",
				duration: 4,
				layers: [
					rect({ name: "Button", x: W / 2, y: H / 2, w: 480, h: 120, radius: 16, fill: "#22C55E", anim: { ...popIn(0), scale: [[0, 0, BACK], [0.5, 1], [2, 1, IO], [2.3, 1.06], [2.6, 1]] } }),
					text({ name: "Label", text: "Learn more  →", size: 56, fill: "#052E16", x: W / 2, y: H / 2, anim: popIn(0.15) }),
				],
			}),
	},
	{
		id: "cta-link-bio",
		name: "Link in bio",
		category: "Call-to-Action Buttons",
		tags: ["bio", "instagram", "tiktok", "vertical"],
		build: () =>
			project({
				name: "Link in bio",
				width: 1080,
				height: 1920,
				duration: 4,
				layers: [
					rect({ name: "Pill", x: 540, y: 1500, w: 640, h: 140, radius: 70, fill: "#FFFFFF", anim: slide({ prop: "y", from: 1620, to: 1500, t: 0 }) }),
					text({ name: "Label", text: "LINK IN BIO", size: 64, fill: "#0F172A", x: 540, y: 1500, anim: slide({ prop: "y", from: 1620, to: 1500, t: 0.1 }) }),
					path({ name: "Arrow", x: 540, y: 1680, points: [{ x: 0, y: 0 }, { x: 60, y: 60 }, { x: 120, y: 0 }], closed: false, fill: null, stroke: "#FFFFFF", strokeWidth: 14, anim: { y: [[0.6, 1680, IO], [1.1, 1710], [1.6, 1680], [2.1, 1710], [2.6, 1680]], opacity: [[0.5, 0], [0.7, 1]] } }),
				],
			}),
	},
	// Transitions
	{
		id: "transition-wipe",
		name: "Colour wipe",
		category: "Transitions",
		tags: ["wipe", "cover", "scene change"],
		build: () =>
			project({
				name: "Colour wipe",
				duration: 1.2,
				layers: [
					rect({ name: "Wipe 1", x: -W, y: H / 2, w: W, h: H, fill: "#2563EB", anchorX: 0, anim: { x: [[0, -W, IO], [0.5, 0], [0.7, 0, IO], [1.2, W]] } }),
					rect({ name: "Wipe 2", x: -W, y: H / 2, w: W, h: H, fill: "#22D3EE", anchorX: 0, anim: { x: [[0.08, -W, IO], [0.55, 0], [0.65, 0, IO], [1.15, W]] } }),
				],
			}),
	},
	{
		id: "transition-circle",
		name: "Circle zoom",
		category: "Transitions",
		tags: ["circle", "zoom", "iris"],
		build: () =>
			project({
				name: "Circle zoom",
				duration: 1.2,
				layers: [ellipse({ name: "Circle", x: W / 2, y: H / 2, w: 2400, h: 2400, fill: "#F59E0B", anim: { scale: [[0, 0, IN], [0.55, 1], [0.65, 1, OUT], [1.2, 0]] } })],
			}),
	},
	// Infographics
	{
		id: "info-bar-chart",
		name: "Growing bar chart",
		category: "Infographics",
		tags: ["chart", "bars", "data", "stats"],
		build: () =>
			project({
				name: "Growing bar chart",
				background: "#0F172A",
				layers: [
					...[0.45, 0.7, 0.55, 0.9].map((v, i) =>
						rect({ name: `Bar ${i + 1}`, x: 660 + i * 200, y: 860, w: 120, h: 520 * v, fill: i === 3 ? "#22D3EE" : "#2563EB", anchorY: 1, anim: { scale: [[0.2 + i * 0.15, 0, OUT], [0.9 + i * 0.15, 1]] } }),
					),
					rect({ name: "Axis", x: W / 2, y: 862, w: 860, h: 4, fill: "#475569", anim: { scale: [[0, 0, OUT], [0.5, 1]] } }),
					text({ name: "Headline", text: "Growth this year", size: 64, x: W / 2, y: 220, anim: slide({ prop: "y", from: 260, to: 220, t: 0 }) }),
				],
			}),
	},
	{
		id: "info-stat",
		name: "Big number stat",
		category: "Infographics",
		tags: ["number", "percentage", "stat"],
		build: () =>
			project({
				name: "Big number stat",
				layers: [
					ellipse({ name: "Track", x: W / 2, y: H / 2, w: 420, h: 420, fill: null, stroke: "#334155", strokeWidth: 28 }),
					ellipse({ name: "Progress", x: W / 2, y: H / 2, w: 420, h: 420, fill: null, stroke: "#22D3EE", strokeWidth: 28, anim: { scale: [[0, 0.6, BACK], [0.6, 1]], opacity: [[0, 0], [0.3, 1]] } }),
					text({ name: "Number", text: "87%", size: 140, x: W / 2, y: H / 2, anim: popIn(0.4) }),
					text({ name: "Label", text: "of viewers watch to the end", size: 40, weight: 500, fill: "#CBD5E1", x: W / 2, y: H / 2 + 300, anim: { opacity: [[0.8, 0], [1.2, 1]] } }),
				],
			}),
	},
	// Loading
	{
		id: "loading-dots",
		name: "Bouncing dots",
		category: "Loading Animations",
		tags: ["loader", "dots", "wait"],
		build: () =>
			project({
				name: "Bouncing dots",
				width: 800,
				height: 400,
				duration: 1.2,
				layers: [0, 1, 2].map((i) =>
					ellipse({ name: `Dot ${i + 1}`, x: 250 + i * 150, y: 200, w: 70, h: 70, fill: ["#2563EB", "#22D3EE", "#F59E0B"][i], anim: { y: [[0, 200], [0.15 + i * 0.15, 200, OUT], [0.35 + i * 0.15, 140, IN], [0.55 + i * 0.15, 200], [1.2, 200]] } }),
				),
			}),
	},
	{
		id: "loading-spinner",
		name: "Spinner ring",
		category: "Loading Animations",
		tags: ["loader", "spinner", "circle"],
		build: () =>
			project({
				name: "Spinner ring",
				width: 600,
				height: 600,
				duration: 1,
				layers: [
					ellipse({ name: "Track", x: 300, y: 300, w: 240, h: 240, fill: null, stroke: "#1E293B", strokeWidth: 24 }),
					path({
						name: "Arc",
						x: 300,
						y: 300,
						points: [{ x: 0, y: 120, out: { x: 0, y: -66 } }, { x: 120, y: 0, in: { x: -66, y: 0 } }],
						closed: false,
						fill: null,
						stroke: "#22D3EE",
						strokeWidth: 24,
						anchorX: 1,
						anchorY: 1,
						anim: { rotation: [[0, 0, EASES.linear], [1, 360]] },
					}),
				],
			}),
	},
	// Stickers
	{
		id: "sticker-wow",
		name: "WOW burst",
		category: "Animated Stickers",
		tags: ["wow", "comic", "burst"],
		build: () =>
			project({
				name: "WOW burst",
				width: 800,
				height: 800,
				duration: 2,
				layers: [
					path({ name: "Burst", x: 400, y: 400, points: starPoints({ size: 560, inner: 0.7, spikes: 12 }), fill: "#FACC15", stroke: "#0F172A", strokeWidth: 10, anim: { scale: [[0, 0, BACK], [0.5, 1]], rotation: [[0, -20, OUT], [2, 10]] } }),
					text({ name: "Word", text: "WOW!", size: 150, weight: 900, fill: "#DC2626", rotation: -8, x: 400, y: 400, anim: popIn(0.25) }),
				],
			}),
	},
	{
		id: "sticker-sparkles",
		name: "Sparkles",
		category: "Animated Stickers",
		tags: ["sparkle", "shine", "stars"],
		build: () =>
			project({
				name: "Sparkles",
				width: 800,
				height: 800,
				duration: 2,
				layers: [
					[400, 380, 300, 0],
					[220, 220, 140, 0.3],
					[600, 560, 160, 0.6],
				].map(([x, y, s, t], i) =>
					path({ name: `Sparkle ${i + 1}`, x, y, points: starPoints({ size: s, inner: 0.25, spikes: 4 }), fill: "#FFFFFF", anim: { scale: [[t, 0, OUT], [t + 0.4, 1, IN], [t + 0.9, 0]], rotation: [[t, 0, EASES.linear], [t + 0.9, 90]] } }),
				),
			}),
	},
	// Intro & outro
	{
		id: "intro-channel",
		name: "Channel intro",
		category: "Intro & Outro",
		tags: ["intro", "youtube", "opener"],
		build: () =>
			project({
				name: "Channel intro",
				duration: 4,
				background: "#020617",
				layers: [
					rect({ name: "Band", x: W / 2, y: H / 2, w: W, h: 260, fill: "#2563EB", anim: { scale: [[0, 0, OUT], [0.5, 1]], opacity: [[3.4, 1, IN], [3.9, 0]] } }),
					path({ name: "Play", x: W / 2 - 330, y: H / 2, points: playPoints(120), fill: "#FFFFFF", anim: { ...popIn(0.5), opacity: [[0.5, 0], [0.7, 1], [3.4, 1, IN], [3.9, 0]] } }),
					text({ name: "Channel name", text: "YOUR CHANNEL", size: 110, weight: 900, x: W / 2 + 60, y: H / 2, anim: { ...slide({ prop: "x", from: W / 2 + 200, to: W / 2 + 60, t: 0.7 }), opacity: [[0.7, 0], [1.1, 1], [3.4, 1, IN], [3.9, 0]] } }),
				],
			}),
	},
	{
		id: "outro-thanks",
		name: "Thanks for watching",
		category: "Intro & Outro",
		tags: ["outro", "end screen", "thanks"],
		build: () =>
			project({
				name: "Thanks for watching",
				duration: 5,
				background: "#0F172A",
				layers: [
					text({ name: "Thanks", text: "Thanks for watching!", size: 100, x: W / 2, y: 260, anim: popIn(0) }),
					rect({ name: "Video slot 1", x: W / 2 - 330, y: 620, w: 560, h: 315, radius: 12, fill: "#1E293B", stroke: "#334155", strokeWidth: 4, anim: popIn(0.4) }),
					rect({ name: "Video slot 2", x: W / 2 + 330, y: 620, w: 560, h: 315, radius: 12, fill: "#1E293B", stroke: "#334155", strokeWidth: 4, anim: popIn(0.55) }),
					rect({ name: "Subscribe", x: W / 2, y: 930, w: 420, h: 100, radius: 50, fill: "#DC2626", anim: popIn(0.9) }),
					text({ name: "Subscribe label", text: "SUBSCRIBE", size: 48, x: W / 2, y: 930, anim: popIn(1) }),
				],
			}),
	},
];

/** A fresh, independent copy of a project (new ids). */
export function cloneProject({ source, name }: { source: MotionProject; name?: string }): MotionProject {
	const fresh = createMotionProject();
	const groupIds = new Map(source.groups.map((g) => [g.id, newId("g")]));
	return {
		...JSON.parse(JSON.stringify(source)),
		id: fresh.id,
		name: name ?? source.name,
		createdAt: fresh.createdAt,
		updatedAt: fresh.updatedAt,
		usedInVideo: false,
		groups: source.groups.map((g) => ({ ...g, id: groupIds.get(g.id) ?? g.id })),
		layers: source.layers.map((l) => ({ ...JSON.parse(JSON.stringify(l)), id: newId(), groupId: l.groupId ? groupIds.get(l.groupId) : undefined })),
	};
}

export function searchTemplates({ templates, query, category }: { templates: MotionTemplate[]; query: string; category: string | null }): MotionTemplate[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return templates.filter(
		(t) =>
			(!category || t.category === category) &&
			words.every((w) => [t.name, t.category, ...t.tags].some((s) => s.toLowerCase().includes(w))),
	);
}

/** Distinct colours used by a project's layers (for quick recolouring). */
export function projectColors(project: MotionProject): string[] {
	const set = new Set<string>();
	for (const l of project.layers) {
		if ("fill" in l && l.fill) set.add(l.fill.toUpperCase());
		if ("stroke" in l && l.stroke) set.add(l.stroke.toUpperCase());
	}
	if (project.background) set.add(project.background.toUpperCase());
	return [...set];
}

export function replaceColor({ project, from, to }: { project: MotionProject; from: string; to: string }): MotionProject {
	const same = (c: string | null | undefined) => !!c && c.toUpperCase() === from.toUpperCase();
	return {
		...project,
		background: same(project.background) ? to : project.background,
		layers: project.layers.map((l) => {
			let out: Layer = l;
			if ("fill" in out && same(out.fill)) out = { ...out, fill: to } as Layer;
			if ("stroke" in out && same(out.stroke)) out = { ...out, stroke: to } as Layer;
			return out;
		}),
	};
}

export function projectFonts(project: MotionProject): string[] {
	return [...new Set(project.layers.flatMap((l) => (l.kind === "text" ? [l.fontFamily] : [])))];
}

export function replaceFont({ project, from, to }: { project: MotionProject; from: string; to: string }): MotionProject {
	return { ...project, layers: project.layers.map((l) => (l.kind === "text" && l.fontFamily === from ? { ...l, fontFamily: to } : l)) };
}
