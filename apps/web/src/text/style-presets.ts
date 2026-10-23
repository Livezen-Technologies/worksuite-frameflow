import type { ParamValues } from "@/params";

/**
 * Text "Styles" (Presets › Styles): looks applied to the selected text
 * without changing its words, size or position.
 */
export interface TextStylePreset {
	id: string;
	name: string;
	params: ParamValues;
}

const clean: ParamValues = {
	"stroke.enabled": false,
	"shadow.enabled": false,
	"glow.enabled": false,
	"background.enabled": false,
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
};

const style = ({
	id,
	name,
	params,
}: {
	id: string;
	name: string;
	params: ParamValues;
}): TextStylePreset => ({ id, name, params: { ...clean, ...params } });

export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
	style({
		id: "white-bold",
		name: "White",
		params: {
			color: "#FFFFFF",
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 8,
			"shadow.offsetX": 0,
			"shadow.offsetY": 3,
		},
	}),
	style({
		id: "yellow-outline",
		name: "Yellow outline",
		params: {
			color: "#FFD60A",
			"stroke.enabled": true,
			"stroke.color": "#000000",
			"stroke.width": 8,
		},
	}),
	style({
		id: "white-outline",
		name: "Outline",
		params: {
			color: "#FFFFFF",
			"stroke.enabled": true,
			"stroke.color": "#000000",
			"stroke.width": 10,
		},
	}),
	style({
		id: "black-on-yellow",
		name: "Highlight",
		params: {
			color: "#111111",
			"background.enabled": true,
			"background.color": "#FFD60A",
			"background.cornerRadius": 6,
			"background.paddingX": 18,
			"background.paddingY": 8,
		},
	}),
	style({
		id: "white-on-black",
		name: "Caption box",
		params: {
			color: "#FFFFFF",
			fontWeight: "normal",
			"background.enabled": true,
			"background.color": "#000000CC",
			"background.cornerRadius": 8,
			"background.paddingX": 16,
			"background.paddingY": 8,
		},
	}),
	style({
		id: "neon-blue",
		name: "Neon blue",
		params: {
			color: "#E6F7FF",
			"glow.enabled": true,
			"glow.color": "#22D3EE",
			"glow.size": 45,
		},
	}),
	style({
		id: "neon-pink",
		name: "Neon pink",
		params: {
			color: "#FFE6F6",
			"glow.enabled": true,
			"glow.color": "#FF2DAA",
			"glow.size": 45,
		},
	}),
	style({
		id: "comic",
		name: "Comic",
		params: {
			color: "#FFE600",
			"stroke.enabled": true,
			"stroke.color": "#E5162B",
			"stroke.width": 12,
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 0,
			"shadow.offsetX": 6,
			"shadow.offsetY": 6,
		},
	}),
	style({
		id: "fire",
		name: "Fire",
		params: {
			color: "#FFE08A",
			"stroke.enabled": true,
			"stroke.color": "#B91C1C",
			"stroke.width": 6,
			"glow.enabled": true,
			"glow.color": "#F97316",
			"glow.size": 35,
		},
	}),
	style({
		id: "ice",
		name: "Ice",
		params: {
			color: "#FFFFFF",
			"stroke.enabled": true,
			"stroke.color": "#1D4ED8",
			"stroke.width": 6,
			"glow.enabled": true,
			"glow.color": "#93C5FD",
			"glow.size": 30,
		},
	}),
	style({
		id: "gold",
		name: "Gold",
		params: {
			color: "#F5C451",
			"stroke.enabled": true,
			"stroke.color": "#5B3A00",
			"stroke.width": 5,
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 10,
			"shadow.offsetX": 0,
			"shadow.offsetY": 4,
		},
	}),
	style({
		id: "pastel",
		name: "Pastel",
		params: {
			color: "#FDE2F3",
			"stroke.enabled": true,
			"stroke.color": "#A855F7",
			"stroke.width": 6,
		},
	}),
	style({
		id: "mint",
		name: "Mint",
		params: {
			color: "#0F172A",
			"background.enabled": true,
			"background.color": "#5EEAD4",
			"background.cornerRadius": 30,
			"background.paddingX": 22,
			"background.paddingY": 8,
		},
	}),
	style({
		id: "red-banner",
		name: "Breaking",
		params: {
			color: "#FFFFFF",
			"background.enabled": true,
			"background.color": "#DC2626",
			"background.cornerRadius": 0,
			"background.paddingX": 20,
			"background.paddingY": 8,
		},
	}),
	style({
		id: "shadow-soft",
		name: "Soft shadow",
		params: {
			color: "#FFFFFF",
			fontWeight: "normal",
			"shadow.enabled": true,
			"shadow.color": "#000000",
			"shadow.blur": 24,
			"shadow.offsetX": 0,
			"shadow.offsetY": 8,
		},
	}),
	style({
		id: "retro",
		name: "Retro",
		params: {
			color: "#FDE68A",
			"stroke.enabled": true,
			"stroke.color": "#7C2D12",
			"stroke.width": 4,
			"shadow.enabled": true,
			"shadow.color": "#EA580C",
			"shadow.blur": 0,
			"shadow.offsetX": 5,
			"shadow.offsetY": 5,
		},
	}),
];

/** CSS for a preview tile approximating a style. */
export function presetPreviewStyle(
	params: ParamValues,
): Record<string, string> {
	const shadows: string[] = [];
	if (params["shadow.enabled"]) {
		shadows.push(
			`${Number(params["shadow.offsetX"] ?? 0) / 3}px ${Number(params["shadow.offsetY"] ?? 0) / 3}px ${Number(params["shadow.blur"] ?? 0) / 3}px ${String(params["shadow.color"] ?? "#000")}`,
		);
	}
	if (params["glow.enabled"]) {
		shadows.push(
			`0 0 ${Number(params["glow.size"] ?? 30) / 4}px ${String(params["glow.color"] ?? "#fff")}`,
		);
	}
	return {
		color: String(params.color ?? "#fff"),
		fontWeight: String(params.fontWeight ?? "bold"),
		...(params["stroke.enabled"]
			? {
					WebkitTextStroke: `${Math.max(1, Number(params["stroke.width"] ?? 4) / 5)}px ${String(params["stroke.color"] ?? "#000")}`,
				}
			: {}),
		...(shadows.length ? { textShadow: shadows.join(", ") } : {}),
		...(params["background.enabled"]
			? {
					background: String(params["background.color"] ?? "#000"),
					padding: "1px 6px",
					borderRadius: `${Number(params["background.cornerRadius"] ?? 0) / 4}px`,
				}
			: {}),
	};
}
