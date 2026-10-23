/** Cursor and input log from a screen recording (SRS SC-06). Times in recorded seconds, positions 0–1. */
export interface CursorLog {
	version: 1;
	display: { width: number; height: number };
	/** [t, x, y], only when the pointer moved. */
	samples: [number, number, number][];
	/** [t, x, y, button]. */
	clicks: [number, number, number, number][];
	/** [t, "Ctrl + S"]: shortcut combinations only (SC-07). */
	keys: [number, string][];
	/** [t, x, y]: typing happened here (no keys are recorded). */
	typing: [number, number, number][];
}

export interface ZoomSegment {
	id: string;
	/** Source seconds. */
	start: number;
	end: number;
	/** 1.25–4. */
	level: number;
	/** Follow the cursor, or hold a fixed point. */
	follow: boolean;
	x: number;
	y: number;
	/** Seconds to ease in and out. */
	ease: number;
}

export type ZoomSensitivity = "low" | "medium" | "high";

export interface ZoomSettings {
	level: number;
	sensitivity: ZoomSensitivity;
	ease: number;
	follow: boolean;
}

/** Stored on a screen-recording clip (SC-11–SC-16), or added by hand on any video (SC-18). */
export interface ScreenZoom {
	segments: ZoomSegment[];
	settings: ZoomSettings;
	log?: CursorLog;
}

export const DEFAULT_ZOOM_SETTINGS: ZoomSettings = {
	level: 2,
	sensitivity: "medium",
	ease: 0.6,
	follow: true,
};

export const MIN_LEVEL = 1.25;
export const MAX_LEVEL = 4;
