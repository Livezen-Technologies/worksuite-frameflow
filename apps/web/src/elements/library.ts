import type { ParamValues } from "@/params";

/** The Elements sidebar: ready-styled shapes, lines, callouts, badges and overlays. */
export type ElementCategory =
	| "Shapes"
	| "Lines & arrows"
	| "Callouts"
	| "Badges"
	| "Overlays"
	| "Stickers";

export const ELEMENT_CATEGORIES: ElementCategory[] = [
	"Shapes",
	"Lines & arrows",
	"Callouts",
	"Badges",
	"Overlays",
	"Stickers",
];

export type ElementPreset =
	| {
			id: string;
			name: string;
			category: Exclude<ElementCategory, "Badges" | "Stickers">;
			kind: "graphic";
			definitionId: string;
			params: ParamValues;
			/** Size as a share of the frame's short side; "frame" covers it. */
			size: number | "frame";
			animation?: ParamValues;
	  }
	| {
			id: string;
			name: string;
			category: "Badges" | "Callouts";
			kind: "text";
			params: ParamValues;
	  };

const shape = (
	preset: Omit<
		Extract<ElementPreset, { kind: "graphic" }>,
		"kind" | "category" | "size"
	> & {
		size?: number;
	},
): ElementPreset => ({
	...preset,
	kind: "graphic",
	category: "Shapes",
	size: preset.size ?? 0.3,
});

const badge = ({
	id,
	name,
	text,
	color,
	background,
	radius = 40,
	font = "Inter",
	extra = {},
}: {
	id: string;
	name: string;
	text: string;
	color: string;
	background: string;
	radius?: number;
	font?: string;
	extra?: ParamValues;
}): ElementPreset => ({
	id,
	name,
	category: "Badges",
	kind: "text",
	params: {
		content: text,
		fontFamily: font,
		fontWeight: "bold",
		fontSize: 7,
		color,
		"background.enabled": true,
		"background.color": background,
		"background.cornerRadius": radius,
		"background.paddingX": 26,
		"background.paddingY": 10,
		"animation.in": "pop",
		...extra,
	},
});

export const ELEMENT_PRESETS: ElementPreset[] = [
	shape({
		id: "rect",
		name: "Rectangle",
		definitionId: "rectangle",
		params: { fill: "#4C8DFF" },
	}),
	shape({
		id: "rounded",
		name: "Rounded",
		definitionId: "rectangle",
		params: { fill: "#22D3EE", cornerRadius: 24 },
	}),
	shape({
		id: "circle",
		name: "Circle",
		definitionId: "ellipse",
		params: { fill: "#F59E0B" },
	}),
	shape({
		id: "ring",
		name: "Ring",
		definitionId: "ellipse",
		params: { fill: "#00000000", stroke: "#ffffff", strokeWidth: 24 },
	}),
	shape({
		id: "triangle",
		name: "Triangle",
		definitionId: "polygon",
		params: { fill: "#10B981", sides: 3 },
	}),
	shape({
		id: "hexagon",
		name: "Hexagon",
		definitionId: "polygon",
		params: { fill: "#8B5CF6", sides: 6 },
	}),
	shape({
		id: "star",
		name: "Star",
		definitionId: "star",
		params: { fill: "#FACC15" },
	}),
	shape({
		id: "burst",
		name: "Burst",
		definitionId: "star",
		params: { fill: "#EF4444", points: 12, depth: 30 },
	}),
	shape({
		id: "heart",
		name: "Heart",
		definitionId: "heart",
		params: { fill: "#FF3D7F" },
		animation: { "animation.combo": "heartbeat" },
	}),
	{
		id: "arrow",
		name: "Arrow",
		category: "Lines & arrows",
		kind: "graphic",
		definitionId: "arrow",
		params: { fill: "#ffffff" },
		size: 0.3,
		animation: { "animation.in": "slide-right" },
	},
	{
		id: "arrow-outline",
		name: "Arrow outline",
		category: "Lines & arrows",
		kind: "graphic",
		definitionId: "arrow",
		params: { fill: "#FACC15", stroke: "#111827", strokeWidth: 14 },
		size: 0.3,
	},
	{
		id: "line",
		name: "Line",
		category: "Lines & arrows",
		kind: "graphic",
		definitionId: "line",
		params: { stroke: "#ffffff" },
		size: 0.5,
	},
	{
		id: "dashed",
		name: "Dashed line",
		category: "Lines & arrows",
		kind: "graphic",
		definitionId: "line",
		params: { stroke: "#ffffff", dashed: true },
		size: 0.5,
	},
	{
		id: "underline",
		name: "Underline",
		category: "Lines & arrows",
		kind: "graphic",
		definitionId: "line",
		params: { stroke: "#FACC15", thickness: 10 },
		size: 0.4,
		animation: { "animation.in": "slide-right", "animation.inDuration": 0.5 },
	},
	{
		id: "bubble",
		name: "Speech bubble",
		category: "Callouts",
		kind: "graphic",
		definitionId: "speech-bubble",
		params: { fill: "#ffffff" },
		size: 0.35,
		animation: { "animation.in": "pop" },
	},
	{
		id: "bubble-right",
		name: "Reply bubble",
		category: "Callouts",
		kind: "graphic",
		definitionId: "speech-bubble",
		params: { fill: "#4C8DFF", stroke: "#4C8DFF", tail: "right" },
		size: 0.35,
		animation: { "animation.in": "pop" },
	},
	{
		id: "callout-note",
		name: "Note",
		category: "Callouts",
		kind: "text",
		params: {
			content: "Tip: press S to split",
			fontFamily: "Inter",
			fontWeight: "bold",
			fontSize: 6,
			color: "#111827",
			"background.enabled": true,
			"background.color": "#FDE68A",
			"background.cornerRadius": 12,
			"background.paddingX": 24,
			"background.paddingY": 14,
			"animation.in": "slide-up",
		},
	},
	badge({
		id: "new",
		name: "New",
		text: "NEW",
		color: "#ffffff",
		background: "#EF4444",
	}),
	badge({
		id: "sale",
		name: "Sale",
		text: "SALE −50%",
		color: "#111827",
		background: "#FACC15",
		radius: 8,
	}),
	badge({
		id: "live",
		name: "Live",
		text: "● LIVE",
		color: "#ffffff",
		background: "#DC2626",
		radius: 8,
		extra: { "animation.combo": "pulse" },
	}),
	badge({
		id: "subscribe",
		name: "Subscribe",
		text: "SUBSCRIBE",
		color: "#ffffff",
		background: "#E62117",
	}),
	badge({
		id: "si-new",
		name: "අලුත්",
		text: "අලුත්",
		color: "#ffffff",
		background: "#16A34A",
		font: "Noto Sans Sinhala",
	}),
	badge({
		id: "follow",
		name: "Follow",
		text: "+ Follow",
		color: "#111827",
		background: "#ffffff",
	}),
	{
		id: "sunset-leak",
		name: "Sunset leak",
		category: "Overlays",
		kind: "graphic",
		definitionId: "gradient",
		params: { from: "#ff7a18aa", to: "#af002d00", angle: 30 },
		size: "frame",
	},
	{
		id: "cool-wash",
		name: "Cool wash",
		category: "Overlays",
		kind: "graphic",
		definitionId: "gradient",
		params: { from: "#22d3ee66", to: "#4f46e566", angle: 90 },
		size: "frame",
	},
	{
		id: "vignette",
		name: "Vignette",
		category: "Overlays",
		kind: "graphic",
		definitionId: "gradient",
		params: { from: "#00000000", to: "#000000cc", radial: true },
		size: "frame",
	},
	{
		id: "bottom-fade",
		name: "Bottom fade",
		category: "Overlays",
		kind: "graphic",
		definitionId: "gradient",
		params: { from: "#00000000", to: "#000000dd", angle: 90 },
		size: "frame",
	},
	{
		id: "frame-white",
		name: "White frame",
		category: "Overlays",
		kind: "graphic",
		definitionId: "frame",
		params: { stroke: "#ffffff" },
		size: "frame",
	},
	{
		id: "frame-gold",
		name: "Gold frame",
		category: "Overlays",
		kind: "graphic",
		definitionId: "frame",
		params: { stroke: "#E0B04A", thickness: 1.5, margin: 3, cornerRadius: 0 },
		size: "frame",
	},
];
