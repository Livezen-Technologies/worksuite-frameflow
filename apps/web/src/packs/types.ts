import type { ParamValues } from "@/params";

/**
 * Social template packs (SRS section 27). A pack template is laid out
 * against the platform's safe area with anchors, not fixed positions, so
 * the same template fits every aspect ratio the pack supports (SP-03,
 * SP-04). Text comes in English, Sinhala and mixed versions (SP-01).
 */

export type PackId = "youtube" | "facebook" | "tiktok" | "podcast";
export type AspectId = "16:9" | "9:16" | "1:1" | "4:5";
export type PackLanguage = "en" | "si" | "mixed";
export type Purpose =
	| "intro"
	| "title"
	| "lower-third"
	| "call-to-action"
	| "captions"
	| "end-screen"
	| "promo";

/** Words in each language; `{token}` placeholders fill from project data (SP-06). */
export type Localized = Record<PackLanguage, string>;

/** Colour by role, so brand kits recolour a whole pack (SP-05). */
export type ColorRole = "primary" | "accent" | "dark" | "light";
export type PackColor = ColorRole | `#${string}`;

/** Where a layer sits inside the safe area: corners, edges or centre. */
export type Anchor = "tl" | "t" | "tr" | "l" | "c" | "r" | "bl" | "b" | "br";

interface Placement {
	anchor: Anchor;
	/** Box size as fractions of the safe area. */
	w: number;
	h: number;
	/** Nudge as fractions of the safe area. */
	dx?: number;
	dy?: number;
	start: number;
	duration: number;
}

export type PackLayer =
	| (Placement & {
			kind: "text";
			text: Localized;
			/** Font size in the editor's text units at 16:9. */
			size: number;
			color: PackColor;
			font?: "heading" | "body";
			/** Pill or box behind the words. */
			box?: PackColor;
			style?: ParamValues;
	  })
	| (Placement & {
			kind: "shape";
			shape: "rectangle" | "ellipse";
			color: PackColor;
			radius?: number;
			opacity?: number;
			animation?: ParamValues;
			/** Audiogram bar: its height follows the sound, this bar's lag (SP-13). */
			audioBar?: number;
	  })
	| (Placement & {
			kind: "media";
			slot: number;
			color: PackColor;
			animation?: ParamValues;
	  })
	| (Placement & {
			/** The brand kit's logo, fitted in the box; left out without one (SP-05). */
			kind: "logo";
			animation?: ParamValues;
	  });

export interface PackTemplate {
	id: string;
	name: string;
	purpose: Purpose;
	layers: PackLayer[];
	/** Aspects this template is offered in; defaults to all of the pack's. */
	aspects?: AspectId[];
}

export interface Insets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface Pack {
	id: PackId;
	name: string;
	description: string;
	aspects: AspectId[];
	/** Platform UI to keep clear of, as fractions of the frame (SP-04). */
	safe: Partial<Record<AspectId, Insets>>;
	palette: Record<ColorRole, string>;
	fonts: { heading: string; body: string };
	templates: PackTemplate[];
}

export const ASPECT_SIZES: Record<AspectId, { width: number; height: number }> =
	{
		"16:9": { width: 1920, height: 1080 },
		"9:16": { width: 1080, height: 1920 },
		"1:1": { width: 1080, height: 1080 },
		"4:5": { width: 1080, height: 1350 },
	};

export const LANGUAGE_LABELS: Record<PackLanguage, string> = {
	en: "English",
	si: "සිංහල",
	mixed: "Mixed",
};

export const PURPOSE_LABELS: Record<Purpose, string> = {
	intro: "Intro",
	title: "Titles",
	"lower-third": "Lower thirds",
	"call-to-action": "Calls to action",
	captions: "Captions",
	"end-screen": "End screens",
	promo: "Promo",
};
