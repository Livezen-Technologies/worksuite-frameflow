import type { ParamValues } from "@/params";
import { DEFAULT_FIELDS } from "./data";
import type {
	ProjectTemplate,
	TemplateLayer,
} from "@/templates/project-templates";
import {
	ASPECT_SIZES,
	type Anchor,
	type AspectId,
	type ColorRole,
	type Insets,
	type Pack,
	type PackColor,
	type PackLanguage,
	type PackTemplate,
} from "./types";

const DEFAULT_SAFE: Insets = {
	top: 0.06,
	right: 0.06,
	bottom: 0.06,
	left: 0.06,
};
const SINHALA_FONT = "Noto Sans Sinhala";
/** Pack sizes are written on a larger scale than the editor's text units. */
const SIZE_UNIT = 0.35;
const COLOR_ROLES: ColorRole[] = ["primary", "accent", "dark", "light"];

/** Text shrinks on narrow frames so lines still fit across. */
const TEXT_SCALE: Record<AspectId, number> = {
	"16:9": 1,
	"1:1": 0.8,
	"4:5": 0.78,
	"9:16": 0.62,
};

export interface PackBrand {
	palette?: Partial<Record<ColorRole, string>>;
	/** First brand kit logo, for logo layers (SP-05). */
	logo?: { name: string; dataUrl: string };
	headingFont?: string;
	bodyFont?: string;
}

/** Values for `{token}` placeholders (SP-06). */
export type PackFields = Record<string, string>;

export function fillPlaceholders({
	text,
	fields,
}: {
	text: string;
	fields: PackFields;
}): string {
	return text.replace(/\{(\w+)\}/g, (match, key: string) => {
		const value = fields[key]?.trim();
		return value ? value : match;
	});
}

export function safeArea({
	pack,
	aspect,
}: {
	pack: Pack;
	aspect: AspectId;
}): Insets {
	return pack.safe[aspect] ?? DEFAULT_SAFE;
}

/**
 * Centre of a box anchored inside the safe area, as fractions of the frame
 * from its top-left corner.
 */
export function anchorCentre({
	anchor,
	safe,
	w,
	h,
	dx = 0,
	dy = 0,
}: {
	anchor: Anchor;
	safe: Insets;
	w: number;
	h: number;
	dx?: number;
	dy?: number;
}): { x: number; y: number; width: number; height: number } {
	const sw = 1 - safe.left - safe.right;
	const sh = 1 - safe.top - safe.bottom;
	const width = w * sw;
	const height = h * sh;
	const column = anchor.includes("l")
		? "left"
		: anchor.includes("r")
			? "right"
			: "centre";
	const row = anchor.startsWith("t")
		? "top"
		: anchor.startsWith("b")
			? "bottom"
			: "middle";
	const x =
		column === "left"
			? safe.left + width / 2
			: column === "right"
				? 1 - safe.right - width / 2
				: safe.left + sw / 2;
	const y =
		row === "top"
			? safe.top + height / 2
			: row === "bottom"
				? 1 - safe.bottom - height / 2
				: safe.top + sh / 2;
	return { x: x + dx * sw, y: y + dy * sh, width, height };
}

function colorOf({
	color,
	pack,
	brand,
}: {
	color: PackColor;
	pack: Pack;
	brand?: PackBrand;
}): string {
	const role = COLOR_ROLES.find((r) => r === color);
	if (!role) return color;
	return brand?.palette?.[role] ?? pack.palette[role];
}

function fontFor({
	language,
	role,
	pack,
	brand,
}: {
	language: PackLanguage;
	role: "heading" | "body";
	pack: Pack;
	brand?: PackBrand;
}): string {
	// Sinhala words need a font with Sinhala letters (SP-08).
	if (language !== "en") return SINHALA_FONT;
	return (
		(role === "heading" ? brand?.headingFont : brand?.bodyFont) ??
		pack.fonts[role]
	);
}

/** Turns a pack template into a video template for one aspect and language. */
export function compilePackTemplate({
	pack,
	template,
	aspect,
	language,
	fields = {},
	brand,
}: {
	pack: Pack;
	template: PackTemplate;
	aspect: AspectId;
	language: PackLanguage;
	fields?: PackFields;
	brand?: PackBrand;
}): ProjectTemplate {
	const safe = safeArea({ pack, aspect });
	const size = ASPECT_SIZES[aspect];
	const layers: TemplateLayer[] = template.layers.map((layer) => {
		const box = anchorCentre({
			anchor: layer.anchor,
			safe,
			w: layer.w,
			h: layer.h,
			dx: layer.dx,
			dy: layer.dy,
		});
		const x = box.x - 0.5;
		const y = box.y - 0.5;
		const timing = { start: layer.start, duration: layer.duration };
		if (layer.kind === "shape")
			return {
				kind: "shape",
				definitionId: layer.shape,
				fill: colorOf({ color: layer.color, pack, brand }),
				width: box.width,
				height: box.height,
				x,
				y,
				cornerRadius: layer.radius,
				opacity: layer.opacity,
				animation: layer.animation,
				...(layer.audioBar !== undefined ? { audioBar: layer.audioBar } : {}),
				...timing,
			};
		if (layer.kind === "logo")
			return {
				kind: "logo",
				width: box.width,
				height: box.height,
				x,
				y,
				animation: layer.animation,
				...timing,
			};
		if (layer.kind === "media")
			return {
				kind: "media",
				slot: layer.slot,
				color: colorOf({ color: layer.color, pack, brand }),
				animation: layer.animation,
				...timing,
			};
		const align = layer.anchor.includes("l")
			? "left"
			: layer.anchor.includes("r")
				? "right"
				: "center";
		const style: ParamValues = {
			fontFamily: fontFor({
				language,
				role: layer.font ?? "body",
				pack,
				brand,
			}),
			fontSize:
				Math.round(layer.size * SIZE_UNIT * TEXT_SCALE[aspect] * 10) / 10,
			color: colorOf({ color: layer.color, pack, brand }),
			textAlign: align,
			fontWeight: layer.font === "heading" ? "bold" : "normal",
			...(layer.box
				? {
						"background.enabled": true,
						"background.color": colorOf({ color: layer.box, pack, brand }),
						"background.cornerRadius": 30,
						"background.paddingX": 24,
						"background.paddingY": 12,
					}
				: {}),
			...(layer.style ?? {}),
		};
		const content = fillPlaceholders({
			text: layer.text[language],
			fields: {
				...DEFAULT_FIELDS[language],
				...Object.fromEntries(
					Object.entries(fields).filter(([, v]) => v.trim()),
				),
			},
		});
		// Left- and right-aligned text is positioned by that edge (text/layout.ts),
		// so put the edge on the box edge, inside any background padding.
		const padding = layer.box
			? (24 * Number(style.fontSize)) / 15 / size.width
			: 0;
		const textX =
			align === "left"
				? box.x - box.width / 2 + padding - 0.5
				: align === "right"
					? box.x + box.width / 2 - padding - 0.5
					: x;
		return {
			kind: "text",
			content,
			style,
			x: textX,
			y,
			...timing,
		};
	});
	return {
		id: `${pack.id}:${template.id}:${aspect}:${language}`,
		name: template.name,
		category: "Social",
		aspect: { label: aspect, ...size },
		description: `${pack.name} · ${template.name}`,
		palette: [
			colorOf({ color: "primary", pack, brand }),
			colorOf({ color: "accent", pack, brand }),
		],
		layers,
	};
}

export function templateAspects({
	pack,
	template,
}: {
	pack: Pack;
	template: PackTemplate;
}): AspectId[] {
	return template.aspects ?? pack.aspects;
}
