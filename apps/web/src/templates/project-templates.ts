import type { ParamValues } from "@/params";
import type { TransitionType } from "@/transitions/types";

/**
 * Video templates (the Templates sidebar): a recipe of media slots, titles
 * and shapes laid out in time. Times are in seconds; positions are fractions
 * of the frame from its centre (x: -0.5 left … 0.5 right).
 */
export type TemplateCategory =
	| "Intro"
	| "Slideshow"
	| "Social"
	| "Promo"
	| "සිංහල"
	| "Business";

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
	"Intro",
	"Slideshow",
	"Social",
	"Promo",
	"සිංහල",
	"Business",
];

export interface TemplateAspect {
	label: "16:9" | "9:16" | "1:1" | "4:5";
	width: number;
	height: number;
}

export const ASPECTS = {
	landscape: { label: "16:9", width: 1920, height: 1080 },
	portrait: { label: "9:16", width: 1080, height: 1920 },
	square: { label: "1:1", width: 1080, height: 1080 },
} satisfies Record<string, TemplateAspect>;

interface LayerTiming {
	start: number;
	duration: number;
}

export type TemplateLayer =
	| (LayerTiming & {
			kind: "media";
			/** Which of the user's media fills it; cycles when there are fewer. */
			slot: number;
			/** Placeholder colour when there's no media. */
			color: string;
			animation?: ParamValues;
			transitionIn?: TransitionType;
	  })
	| (LayerTiming & {
			kind: "text";
			content: string;
			/** Text params (font, colour, stroke, animation…). */
			style: ParamValues;
			x?: number;
			y?: number;
	  })
	| (LayerTiming & {
			kind: "shape";
			definitionId: "rectangle" | "ellipse";
			fill: string;
			/** Size as fractions of the frame. */
			width: number;
			height: number;
			x?: number;
			y?: number;
			cornerRadius?: number;
			opacity?: number;
			animation?: ParamValues;
	  });

export interface ProjectTemplate {
	id: string;
	name: string;
	category: TemplateCategory;
	aspect: TemplateAspect;
	description: string;
	/** Two colours for the gallery card. */
	palette: [string, string];
	layers: TemplateLayer[];
}

export function templateDuration(template: ProjectTemplate): number {
	return Math.max(...template.layers.map((l) => l.start + l.duration));
}

export function templateSlots(template: ProjectTemplate): number {
	const slots = template.layers.flatMap((l) =>
		l.kind === "media" ? [l.slot] : [],
	);
	return slots.length === 0 ? 0 : Math.max(...slots) + 1;
}

const fadeIn = { "animation.in": "fade", "animation.inDuration": 0.6 };
const slowZoom = { "animation.combo": "ken-burns" };

/** Back-to-back media slides with a transition into each one after the first. */
function slides({
	count,
	length,
	colors,
	transition,
	animation,
	start = 0,
}: {
	count: number;
	length: number;
	colors: string[];
	transition?: TransitionType;
	animation?: ParamValues;
	start?: number;
}): TemplateLayer[] {
	return Array.from({ length: count }, (_, i) => ({
		kind: "media" as const,
		slot: i,
		start: start + i * length,
		duration: length,
		color: colors[i % colors.length],
		animation,
		transitionIn: i > 0 ? transition : undefined,
	}));
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		id: "cinematic-intro",
		name: "Cinematic Intro",
		category: "Intro",
		aspect: ASPECTS.landscape,
		description:
			"Three slow-zoom shots that dissolve together under a glowing title.",
		palette: ["#0f172a", "#2ec4ff"],
		layers: [
			...slides({
				count: 3,
				length: 2.5,
				colors: ["#1e293b", "#0f3a5f", "#312e81"],
				transition: "cross-dissolve",
				animation: slowZoom,
			}),
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#000000",
				width: 1,
				height: 1,
				opacity: 0.35,
				start: 0,
				duration: 7.5,
			},
			{
				kind: "text",
				content: "YOUR STORY",
				start: 0.8,
				duration: 5.5,
				style: {
					fontFamily: "Bebas Neue",
					fontSize: 34,
					color: "#E9FBFF",
					letterSpacing: 6,
					"glow.enabled": true,
					"glow.color": "#2EC4FF",
					"glow.size": 30,
					"animation.in": "zoom-in",
					"animation.inDuration": 1.2,
					"animation.out": "fade",
				},
			},
		],
	},
	{
		id: "travel-slideshow",
		name: "Travel Slideshow",
		category: "Slideshow",
		aspect: ASPECTS.landscape,
		description:
			"Four photos that slide in one after another, with a place name lower third.",
		palette: ["#f4845f", "#f7b267"],
		layers: [
			...slides({
				count: 4,
				length: 2.5,
				colors: ["#f4845f", "#f7b267", "#2a9d8f", "#e76f51"],
				transition: "slide",
				animation: slowZoom,
			}),
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#ffffff",
				width: 0.32,
				height: 0.12,
				x: -0.3,
				y: 0.34,
				cornerRadius: 18,
				opacity: 0.92,
				start: 0.5,
				duration: 4,
				animation: {
					"animation.in": "slide-right",
					"animation.out": "slide-left",
				},
			},
			{
				kind: "text",
				content: "Ella, Sri Lanka",
				start: 0.7,
				duration: 3.6,
				x: -0.3,
				y: 0.34,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 9,
					color: "#1f2937",
					"animation.in": "slide-right",
					"animation.out": "slide-left",
				},
			},
		],
	},
	{
		id: "reel-hook",
		name: "Reel Hook",
		category: "Social",
		aspect: ASPECTS.portrait,
		description:
			"A vertical reel: a bold hook, quick pops between shots and a subscribe badge.",
		palette: ["#7b2cbf", "#ff3d7f"],
		layers: [
			...slides({
				count: 3,
				length: 2,
				colors: ["#7b2cbf", "#ff3d7f", "#4361ee"],
				transition: "zoom-in",
				animation: { "animation.combo": "pulse", "animation.comboSpeed": 0.5 },
			}),
			{
				kind: "text",
				content: "WAIT FOR IT…",
				start: 0,
				duration: 2,
				y: -0.3,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 12,
					color: "#ffffff",
					"stroke.enabled": true,
					"stroke.color": "#000000",
					"stroke.width": 8,
					"animation.in": "pop",
				},
			},
			{
				kind: "text",
				content: "SUBSCRIBE",
				start: 4,
				duration: 2,
				y: 0.32,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 7,
					color: "#ffffff",
					"background.enabled": true,
					"background.color": "#E62117",
					"background.cornerRadius": 40,
					"background.paddingX": 28,
					"background.paddingY": 12,
					"animation.in": "bounce",
				},
			},
		],
	},
	{
		id: "product-promo",
		name: "Product Promo",
		category: "Promo",
		aspect: ASPECTS.square,
		description:
			"Square promo: your product pops in on a colour card with a price tag.",
		palette: ["#ffd23f", "#ee4266"],
		layers: [
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#ffd23f",
				width: 1,
				height: 1,
				start: 0,
				duration: 5,
			},
			{
				kind: "media",
				slot: 0,
				start: 0.3,
				duration: 4.7,
				color: "#ee4266",
				animation: { "animation.in": "pop", "animation.combo": "float" },
			},
			{
				kind: "text",
				content: "NEW ARRIVAL",
				start: 0.6,
				duration: 4.4,
				y: -0.38,
				style: {
					fontFamily: "Bebas Neue",
					fontSize: 16,
					color: "#1b1b1b",
					letterSpacing: 4,
					"animation.in": "slide-down",
				},
			},
			{
				kind: "text",
				content: "Rs. 4,990",
				start: 1.2,
				duration: 3.8,
				y: 0.38,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 10,
					color: "#ffffff",
					"background.enabled": true,
					"background.color": "#ee4266",
					"background.cornerRadius": 30,
					"background.paddingX": 26,
					"background.paddingY": 10,
					"animation.in": "pop",
					"animation.combo": "heartbeat",
				},
			},
		],
	},
	{
		id: "avurudu-wish",
		name: "සුබ අලුත් අවුරුද්දක්",
		category: "සිංහල",
		aspect: ASPECTS.landscape,
		description:
			"Sinhala & Tamil New Year greeting with a typewriter Sinhala title.",
		palette: ["#7f1d1d", "#f59e0b"],
		layers: [
			...slides({
				count: 2,
				length: 3.5,
				colors: ["#7f1d1d", "#b45309"],
				transition: "blur-dissolve",
				animation: slowZoom,
			}),
			{
				kind: "text",
				content: "සුබ අලුත් අවුරුද්දක් වේවා!",
				start: 0.5,
				duration: 6,
				style: {
					fontFamily: "Abhaya Libre",
					fontWeight: "bold",
					fontSize: 20,
					color: "#FDE68A",
					"shadow.enabled": true,
					"shadow.color": "#3A2410",
					"shadow.blur": 8,
					"shadow.offsetY": 5,
					"animation.in": "typewriter",
					"animation.inDuration": 2,
					"animation.out": "fade",
				},
			},
		],
	},
	{
		id: "podcast-quote",
		name: "Podcast Quote",
		category: "Social",
		aspect: ASPECTS.portrait,
		description: "A vertical quote card with the speaker's clip and name.",
		palette: ["#111827", "#22d3ee"],
		layers: [
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#111827",
				width: 1,
				height: 1,
				start: 0,
				duration: 6,
			},
			{
				kind: "media",
				slot: 0,
				start: 0,
				duration: 6,
				color: "#1f2937",
				animation: fadeIn,
			},
			{
				kind: "text",
				content: "“Small steps,\nevery day.”",
				start: 0.4,
				duration: 5.6,
				y: -0.32,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 10,
					color: "#ffffff",
					"animation.in": "typewriter",
					"animation.inDuration": 1.6,
				},
			},
			{
				kind: "text",
				content: "— Nimal Perera, Episode 12",
				start: 1.6,
				duration: 4.4,
				y: 0.36,
				style: {
					fontFamily: "Inter",
					fontSize: 5,
					color: "#22d3ee",
					"animation.in": "slide-up",
				},
			},
		],
	},
	{
		id: "end-screen",
		name: "YouTube End Screen",
		category: "Business",
		aspect: ASPECTS.landscape,
		description:
			"Two “watch next” boxes and a subscribe circle, timed for the last 8 seconds.",
		palette: ["#0b0d12", "#e62117"],
		layers: [
			{
				kind: "media",
				slot: 0,
				start: 0,
				duration: 8,
				color: "#0b0d12",
				animation: { "animation.combo": "ken-burns" },
			},
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#ffffff",
				width: 0.3,
				height: 0.3,
				x: -0.22,
				y: -0.05,
				cornerRadius: 16,
				opacity: 0.85,
				start: 0.3,
				duration: 7.7,
				animation: { "animation.in": "slide-right" },
			},
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#ffffff",
				width: 0.3,
				height: 0.3,
				x: 0.22,
				y: -0.05,
				cornerRadius: 16,
				opacity: 0.85,
				start: 0.5,
				duration: 7.5,
				animation: { "animation.in": "slide-left" },
			},
			{
				kind: "shape",
				definitionId: "ellipse",
				fill: "#e62117",
				width: 0.12,
				height: 0.12 * (16 / 9),
				y: 0.32,
				start: 0.8,
				duration: 7.2,
				animation: { "animation.in": "pop", "animation.combo": "pulse" },
			},
			{
				kind: "text",
				content: "Watch next",
				start: 0.3,
				duration: 7.7,
				y: -0.36,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 8,
					color: "#ffffff",
					"animation.in": "fade",
				},
			},
		],
	},
	{
		id: "announcement",
		name: "Business Announcement",
		category: "Business",
		aspect: ASPECTS.landscape,
		description:
			"A clean company update: headline, detail line and your footage behind.",
		palette: ["#1e3a8a", "#ffffff"],
		layers: [
			...slides({
				count: 2,
				length: 3,
				colors: ["#1e3a8a", "#1e40af"],
				transition: "push",
				animation: slowZoom,
			}),
			{
				kind: "shape",
				definitionId: "rectangle",
				fill: "#0b1220",
				width: 1,
				height: 0.34,
				y: 0.33,
				opacity: 0.85,
				start: 0,
				duration: 6,
				animation: { "animation.in": "slide-up" },
			},
			{
				kind: "text",
				content: "We're opening in Kandy",
				start: 0.4,
				duration: 5.6,
				y: 0.28,
				style: {
					fontFamily: "Inter",
					fontWeight: "bold",
					fontSize: 11,
					color: "#ffffff",
					"animation.in": "slide-up",
				},
			},
			{
				kind: "text",
				content: "From 1 December · worksuitecloud.com",
				start: 0.9,
				duration: 5.1,
				y: 0.4,
				style: {
					fontFamily: "Inter",
					fontSize: 5,
					color: "#93c5fd",
					"animation.in": "fade",
				},
			},
		],
	},
];

/** All fonts the templates use, to load before applying. */
export const PROJECT_TEMPLATE_FONTS = [
	...new Set(
		PROJECT_TEMPLATES.flatMap((t) =>
			t.layers.flatMap((l) =>
				l.kind === "text" && typeof l.style.fontFamily === "string"
					? [l.style.fontFamily]
					: [],
			),
		),
	),
];
