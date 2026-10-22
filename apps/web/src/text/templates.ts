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
