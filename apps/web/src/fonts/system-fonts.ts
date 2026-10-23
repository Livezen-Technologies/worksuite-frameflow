import { LEGACY_FONT_FAMILIES } from "@/input-method/legacy";

export const SYSTEM_FONTS = new Set([
	"Arial",
	"Helvetica",
	"Times New Roman",
	"Courier New",
	"Verdana",
	"Georgia",
	"monospace",
	"sans-serif",
	"serif",
	// Legacy Sinhala fonts, used when installed; text is converted when drawn.
	...LEGACY_FONT_FAMILIES,
]);
