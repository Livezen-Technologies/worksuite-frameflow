/**
 * Styling a screen recording after it's made (SRS SC-07, SC-15, SC-17):
 * the cursor and keys come from the recorded input log, so all of this can
 * be changed at any time without re-recording.
 */
export interface CursorStyle {
	enabled: boolean;
	/** 1–4× the normal size. */
	size: number;
	/** Glide between samples instead of jumping. */
	smooth: boolean;
	/** Fade out after this many seconds without movement; 0 = never. */
	hideAfter: number;
	clickRipple: boolean;
	rippleColor: string;
}

export interface KeyStyle {
	/** Off by default (SC-07). */
	enabled: boolean;
	position: "bottom" | "top";
}

export interface BackgroundStyle {
	enabled: boolean;
	/** Space around the screen, 0–0.3 of the frame's short side. */
	padding: number;
	/** Corner radius, 0–0.1 of the frame's short side. */
	radius: number;
	/** Shadow strength 0–1. */
	shadow: number;
	/** CSS colour or gradient. */
	fill: string;
}

export interface ScreenStyle {
	cursor: CursorStyle;
	keys: KeyStyle;
	background: BackgroundStyle;
}

export const DEFAULT_SCREEN_STYLE: ScreenStyle = {
	cursor: {
		enabled: false,
		size: 1.5,
		smooth: true,
		hideAfter: 2,
		clickRipple: true,
		rippleColor: "#4c8dff",
	},
	keys: { enabled: false, position: "bottom" },
	background: {
		enabled: false,
		padding: 0.06,
		radius: 0.025,
		shadow: 0.5,
		fill: "linear-gradient(135deg, #4c8dff 0%, #8b5cf6 100%)",
	},
};
