import type { TextAnimationStyle } from "./types";

/** Extra looks a text clip can carry that its params don't (gradient fill). */
export type TextStyleOverrides = Partial<Pick<TextAnimationStyle, "gradient" | "plate" | "maxWidth">>;

/**
 * The animation style of a text clip from what the existing text pipeline
 * already resolved (font string parts, px sizes, stroke/shadow/glow and
 * background plate), so animated text looks exactly like static text.
 */
export function styleFromResolvedText({
	params,
	scaledFontSize,
	letterSpacingPx,
	lineHeightPx,
	textAlign,
	textColor,
	styleEffects,
	background,
	backgroundColor,
	overrides,
}: {
	params: Record<string, unknown>;
	scaledFontSize: number;
	letterSpacingPx: number;
	lineHeightPx: number;
	textAlign: "left" | "center" | "right";
	textColor: string;
	styleEffects?: {
		stroke?: { color: string; widthPx: number };
		shadow?: { color: string; blurPx: number; offsetXPx: number; offsetYPx: number };
		glow?: { color: string; sizePx: number };
	};
	background?: { enabled: boolean; paddingX: number; cornerRadius: number } | null;
	backgroundColor?: string;
	overrides?: TextStyleOverrides;
}): TextAnimationStyle {
	const fs = Math.max(1, scaledFontSize);
	return {
		fontFamily: typeof params.fontFamily === "string" ? params.fontFamily : "Arial",
		fontWeight: params.fontWeight === "bold" ? "bold" : typeof params.fontWeight === "number" ? params.fontWeight : "normal",
		fontStyle: params.fontStyle === "italic" ? "italic" : "normal",
		fontSize: fs,
		tracking: letterSpacingPx / fs,
		lineHeight: lineHeightPx / fs,
		align: textAlign,
		fill: textColor,
		gradient: overrides?.gradient ?? null,
		stroke: styleEffects?.stroke ? { color: styleEffects.stroke.color, width: styleEffects.stroke.widthPx } : null,
		shadow: styleEffects?.shadow ? { color: styleEffects.shadow.color, blur: styleEffects.shadow.blurPx, x: styleEffects.shadow.offsetXPx, y: styleEffects.shadow.offsetYPx } : null,
		glow: styleEffects?.glow ? { color: styleEffects.glow.color, size: styleEffects.glow.sizePx / fs } : null,
		plate:
			overrides?.plate ??
			(background?.enabled && backgroundColor
				? { color: backgroundColor, padding: Math.max(0.1, background.paddingX / fs), radius: background.cornerRadius / 100 }
				: null),
		...(overrides?.maxWidth ? { maxWidth: overrides.maxWidth } : {}),
	};
}
