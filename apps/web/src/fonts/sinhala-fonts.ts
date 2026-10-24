"use client";

import { LEGACY_FONT_FAMILIES } from "@/input-method/legacy";

/**
 * The Sinhala font pack: open-licence (SIL OFL) Unicode fonts, loaded from
 * Google Fonts on demand (Noto Sans Sinhala is bundled), plus legacy FM/DL
 * fonts found on this computer. Legacy fonts aren't shipped (their licences
 * don't allow it); text in them is kept as Unicode and converted when drawn.
 */
export const SINHALA_UNICODE_FONTS: Array<{ family: string; style: string; bundled?: boolean }> = [
	{ family: "Noto Sans Sinhala", style: "Sans", bundled: true },
	{ family: "Noto Serif Sinhala", style: "Serif" },
	{ family: "Abhaya Libre", style: "Serif" },
	{ family: "Yaldevi", style: "Sans" },
	{ family: "Gemunu Libre", style: "Condensed" },
	{ family: "Stick No Bills", style: "Display" },
];

export const SINHALA_SAMPLE = "සිංහල අකුරු";

let detected: Promise<string[]> | null = null;

/** Legacy Sinhala fonts installed on this computer (checked by measuring text). */
export function installedLegacyFonts(): Promise<string[]> {
	detected ??= (async () => {
		if (typeof document === "undefined") return [];
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return [];
		const sample = "wdhqlmnbcdkWQ@#$%^&{}";
		const width = (font: string) => {
			ctx.font = `32px ${font}`;
			return ctx.measureText(sample).width;
		};
		const bases = ["monospace", "serif"] as const;
		const baseWidths = bases.map(width);
		return LEGACY_FONT_FAMILIES.filter((family) =>
			bases.some((b, i) => Math.abs(width(`"${family}", ${b}`) - (baseWidths[i] ?? 0)) > 0.5),
		);
	})();
	return detected;
}
