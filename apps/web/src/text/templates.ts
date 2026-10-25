"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import { TEXT_STYLE_PARAM_KEYS } from "./style";

export const TEXT_TEMPLATE_CATEGORIES = [
	"Titles",
	"Lower thirds",
	"Social",
	"සිංහල",
	"Animated",
] as const;

export type TextTemplateCategory = (typeof TEXT_TEMPLATE_CATEGORIES)[number];

export interface TextTemplate {
	id: string;
	name: string;
	categories: TextTemplateCategory[];
	/** Text params; content included so a fresh clip shows the sample. */
	params: ParamValues;
}

/** Keys a template sets when its style is applied to an existing clip (WS-33). */
export const TEMPLATE_STYLE_KEYS = [
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
	...TEXT_STYLE_PARAM_KEYS,
];

const off: ParamValues = {
	"stroke.enabled": false,
	"shadow.enabled": false,
	"glow.enabled": false,
	"background.enabled": false,
	"animation.in": "none",
	"animation.out": "none",
};

export const TEXT_TEMPLATES: TextTemplate[] = [
	{
		id: "bold-title-si",
		name: "Bold title සි",
		categories: ["Titles", "සිංහල"],
		params: {
			...off,
			content: "අලුත් ආරම්භය",
			fontFamily: "Noto Sans Sinhala",
			fontWeight: "bold",
			fontSize: 22,
			color: "#ffffff",
			"shadow.enabled": true,
			"shadow.blur": 12,
			"shadow.offsetY": 6,
			"animation.in": "pop",
		},
	},
	{
		id: "neon-glow",
		name: "Neon glow",
		categories: ["Titles", "Animated"],
		params: {
			...off,
			content: "NEON NIGHTS",
			fontFamily: "Inter",
			fontWeight: "bold",
			fontSize: 20,
			color: "#E9FBFF",
			"glow.enabled": true,
			"glow.color": "#2EC4FF",
			"glow.size": 35,
			"animation.in": "fade",
		},
	},
	{
		id: "lower-third",
		name: "Lower third",
		categories: ["Lower thirds"],
		params: {
			...off,
			content: "Nimal Perera\nProducer",
			fontFamily: "Inter",
			fontWeight: "bold",
			fontSize: 8,
			color: "#ffffff",
			textAlign: "left",
			"background.enabled": true,
			"background.color": "#4F46E5",
			"background.cornerRadius": 12,
			"background.paddingX": 24,
			"background.paddingY": 12,
			"transform.positionX": -520,
			"transform.positionY": 380,
			"animation.in": "slide-up",
			"animation.out": "fade",
		},
	},
	{
		id: "poster-condensed",
		name: "Poster condensed",
		categories: ["Titles", "Social"],
		params: {
			...off,
			content: "SUMMER SALE",
			fontFamily: "Bebas Neue",
			fontSize: 30,
			color: "#FFD23F",
			letterSpacing: 4,
			"stroke.enabled": true,
			"stroke.color": "#1B1B1B",
			"stroke.width": 4,
		},
	},
	{
		id: "classic-sinhala",
		name: "Classic Sinhala",
		categories: ["සිංහල", "Titles"],
		params: {
			...off,
			content: "සුබ නව වසරක් වේවා",
			fontFamily: "Abhaya Libre",
			fontWeight: "bold",
			fontSize: 18,
			color: "#F5E6C8",
			"shadow.enabled": true,
			"shadow.color": "#3A2410",
			"shadow.blur": 6,
			"shadow.offsetY": 4,
			"animation.in": "typewriter",
			"animation.inDuration": 1.5,
		},
	},
	{
		id: "script",
		name: "Script",
		categories: ["Titles"],
		params: {
			...off,
			content: "with love",
			fontFamily: "Pacifico",
			fontSize: 18,
			color: "#FF8FB1",
			"shadow.enabled": true,
			"shadow.color": "#00000080",
			"shadow.blur": 8,
			"shadow.offsetY": 4,
			"animation.in": "fade",
		},
	},
	{
		id: "outline",
		name: "Outline",
		categories: ["Titles", "Social"],
		params: {
			...off,
			content: "OUTLINE",
			fontFamily: "Inter",
			fontWeight: "bold",
			fontSize: 24,
			color: "#00000000",
			"stroke.enabled": true,
			"stroke.color": "#ffffff",
			"stroke.width": 3,
		},
	},
	{
		id: "mixed-si-en",
		name: "Mixed සි+EN",
		categories: ["සිංහල", "Social"],
		params: {
			...off,
			content: "අද vlog එක 🎬",
			fontFamily: "Noto Sans Sinhala",
			fontWeight: "bold",
			fontSize: 14,
			color: "#ffffff",
			"background.enabled": true,
			"background.color": "#000000B3",
			"background.cornerRadius": 16,
			"background.paddingX": 20,
			"background.paddingY": 10,
			"animation.in": "typewriter",
		},
	},
	{
		id: "subscribe-badge",
		name: "Subscribe badge",
		categories: ["Social", "Animated"],
		params: {
			...off,
			content: "SUBSCRIBE",
			fontFamily: "Inter",
			fontWeight: "bold",
			fontSize: 10,
			color: "#ffffff",
			"background.enabled": true,
			"background.color": "#E62117",
			"background.cornerRadius": 40,
			"background.paddingX": 28,
			"background.paddingY": 12,
			"transform.positionY": 360,
			"animation.in": "bounce",
			"animation.out": "pop",
		},
	},
	{
		id: "shadow-stack",
		name: "Shadow stack",
		categories: ["Titles", "Animated"],
		params: {
			...off,
			content: "STACKED",
			fontFamily: "Bebas Neue",
			fontSize: 28,
			color: "#ffffff",
			"shadow.enabled": true,
			"shadow.color": "#FF3D7F",
			"shadow.blur": 0,
			"shadow.offsetX": 6,
			"shadow.offsetY": 6,
			"animation.in": "slide-up",
		},
	},
];

/*
 * Generated templates: 25 sample texts × 12 looks = 300 (Presets › Templates).
 * Each picks its font for the text's script and an In animation.
 */
const SAMPLES: Array<{ text: string; cat: TextTemplateCategory; si?: boolean; size: number }> = [
	{ text: "BIG ANNOUNCEMENT", cat: "Titles", size: 20 },
	{ text: "Chapter One", cat: "Titles", size: 18 },
	{ text: "THE END", cat: "Titles", size: 24 },
	{ text: "Coming Soon", cat: "Titles", size: 20 },
	{ text: "Breaking News", cat: "Titles", size: 18 },
	{ text: "Top 5 Tips", cat: "Titles", size: 20 },
	{ text: "Behind the Scenes", cat: "Titles", size: 16 },
	{ text: "Nimal Perera\nProducer", cat: "Lower thirds", size: 10 },
	{ text: "Live from Colombo", cat: "Lower thirds", size: 10 },
	{ text: "Guest Speaker", cat: "Lower thirds", size: 10 },
	{ text: "@yourhandle", cat: "Social", size: 12 },
	{ text: "SUBSCRIBE", cat: "Social", size: 16 },
	{ text: "Link in bio", cat: "Social", size: 12 },
	{ text: "Like & Share", cat: "Social", size: 14 },
	{ text: "SALE 50% OFF", cat: "Social", size: 20 },
	{ text: "New Video!", cat: "Social", size: 18 },
	{ text: "Wait for it…", cat: "Social", size: 16 },
	{ text: "සුබ උපන්දිනයක්", cat: "සිංහල", si: true, size: 18 },
	{ text: "සුබ අලුත් අවුරුද්දක්", cat: "සිංහල", si: true, size: 16 },
	{ text: "ස්තූතියි", cat: "සිංහල", si: true, size: 22 },
	{ text: "අලුත් වීඩියෝව", cat: "සිංහල", si: true, size: 18 },
	{ text: "සබ්ස්ක්‍රයිබ් කරන්න", cat: "සිංහල", si: true, size: 14 },
	{ text: "විශේෂ දීමනාව", cat: "සිංහල", si: true, size: 18 },
	{ text: "ආයුබෝවන්", cat: "සිංහල", si: true, size: 22 },
	{ text: "ප්‍රවෘත්ති", cat: "සිංහල", si: true, size: 20 },
];

const LOOKS: Array<{ name: string; font: string; anim: string; params: ParamValues }> = [
	{ name: "Bold", font: "Inter", anim: "pop", params: { color: "#FFFFFF", fontWeight: "bold", "shadow.enabled": true, "shadow.color": "#000000", "shadow.blur": 12, "shadow.offsetY": 5 } },
	{ name: "Poster", font: "Bebas Neue", anim: "g:0:0.8:1:0:back", params: { color: "#FFD60A", fontWeight: "bold", letterSpacing: 2 } },
	{ name: "Neon", font: "Inter", anim: "fade", params: { color: "#E9FBFF", fontWeight: "bold", "glow.enabled": true, "glow.color": "#2EC4FF", "glow.size": 40 } },
	{ name: "Pink neon", font: "Inter", anim: "flash", params: { color: "#FFF0FA", fontWeight: "bold", "glow.enabled": true, "glow.color": "#FF4FA3", "glow.size": 45 } },
	{ name: "Box", font: "Inter", anim: "g:0.8:0:1:0:smooth", params: { color: "#FFFFFF", fontWeight: "bold", "background.enabled": true, "background.color": "#4F46E5", "background.cornerRadius": 6, "background.paddingX": 20, "background.paddingY": 10 } },
	{ name: "Highlight", font: "Inter", anim: "wipe-right", params: { color: "#111111", fontWeight: "bold", "background.enabled": true, "background.color": "#FFD60A", "background.cornerRadius": 2, "background.paddingX": 16, "background.paddingY": 6 } },
	{ name: "Outline", font: "Inter", anim: "zoom-in", params: { color: "#FFFFFF", fontWeight: "bold", "stroke.enabled": true, "stroke.color": "#000000", "stroke.width": 12 } },
	{ name: "Comic", font: "Bebas Neue", anim: "bounce", params: { color: "#FFE14D", fontWeight: "bold", "stroke.enabled": true, "stroke.color": "#000000", "stroke.width": 8, "shadow.enabled": true, "shadow.color": "#000000", "shadow.blur": 0, "shadow.offsetX": 6, "shadow.offsetY": 6 } },
	{ name: "Elegant", font: "Abhaya Libre", anim: "fade", params: { color: "#F5E6C8", fontWeight: "normal", fontStyle: "italic", "shadow.enabled": true, "shadow.color": "#00000099", "shadow.blur": 18, "shadow.offsetY": 6 } },
	{ name: "Script", font: "Pacifico", anim: "g:0:0:0.6:-20:smooth", params: { color: "#FFFFFF", fontWeight: "normal", "shadow.enabled": true, "shadow.color": "#000000", "shadow.blur": 10, "shadow.offsetY": 4 } },
	{ name: "Red pill", font: "Inter", anim: "g:0:0:0.2:0:back", params: { color: "#FFFFFF", fontWeight: "bold", "background.enabled": true, "background.color": "#E11D48", "background.cornerRadius": 60, "background.paddingX": 26, "background.paddingY": 10 } },
	{ name: "Glass", font: "Inter", anim: "g:0:0.3:1:0:smooth", params: { color: "#FFFFFF", fontWeight: "bold", "background.enabled": true, "background.color": "#FFFFFF26", "background.cornerRadius": 14, "background.paddingX": 22, "background.paddingY": 10, "stroke.enabled": false } },
];

for (const look of LOOKS)
	for (const sample of SAMPLES) {
		const sinhala = !!sample.si;
		const font = sinhala ? (look.font === "Abhaya Libre" ? "Abhaya Libre" : "Noto Sans Sinhala") : look.font;
		TEXT_TEMPLATES.push({
			id: `gen-${look.name.toLowerCase().replace(/\s+/g, "-")}-${SAMPLES.indexOf(sample)}`,
			name: `${look.name} · ${sample.text.split("\n")[0]}`,
			categories: look.anim === "none" ? [sample.cat] : [sample.cat, "Animated"],
			params: {
				...off,
				content: sample.text,
				fontFamily: font,
				fontSize: sample.size,
				textAlign: "center",
				...look.params,
				"animation.in": look.anim,
				"animation.inDuration": 0.6,
			},
		});
	}

/** Fonts the templates use, so the gallery can load them up front. */
export const TEMPLATE_FONTS = [
	...new Set(
		TEXT_TEMPLATES.map((t) => t.params.fontFamily).filter(
			(f): f is string => typeof f === "string",
		),
	),
];

/** Only the style part of a template, for applying to an existing clip. */
export function templateStyle(params: ParamValues): ParamValues {
	const style: ParamValues = {};
	for (const key of TEMPLATE_STYLE_KEYS) {
		if (key in params) style[key] = params[key];
	}
	return style;
}

interface MyTemplatesStore {
	templates: TextTemplate[];
	save: (args: { name: string; params: ParamValues }) => TextTemplate;
	remove: (id: string) => void;
}

/** "My templates" (WS-31), kept on this device. */
export const useMyTextTemplates = create<MyTemplatesStore>()(
	persist(
		(set) => ({
			templates: [],
			save: ({ name, params }) => {
				const template: TextTemplate = {
					id: `my-${Date.now().toString(36)}`,
					name: name.trim() || "My template",
					categories: [],
					params,
				};
				set((state) => ({ templates: [...state.templates, template] }));
				return template;
			},
			remove: (id) =>
				set((state) => ({
					templates: state.templates.filter((t) => t.id !== id),
				})),
		}),
		{ name: "frameflow-text-templates" },
	),
);
