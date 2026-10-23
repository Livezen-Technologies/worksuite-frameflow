import type { ProjectHdrSettings } from "@/hdr/settings";
import type { FrameRate } from "opencut-wasm";
import type { TScene } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

export type TBackground =
	| {
			type: "color";
			color: string;
	  }
	| {
			type: "blur";
			blurIntensity: number;
	  };

export interface TCanvasSize {
	width: number;
	height: number;
}

export interface TProjectCover {
	source: "video" | "upload";
	/** Timeline time in ticks the cover was taken from (source "video"). */
	time: number;
	/** JPEG data URL. */
	image: string;
}

export interface TProjectMetadata {
	id: string;
	name: string;
	thumbnail?: string;
	/** Chosen cover picture; also used as the project thumbnail. */
	cover?: TProjectCover;
	duration: MediaTime;
	createdAt: Date;
	updatedAt: Date;
}

export interface TProjectSettings {
	fps: FrameRate;
	canvasSize: TCanvasSize;
	canvasSizeMode?: "preset" | "custom";
	lastCustomCanvasSize?: TCanvasSize | null;
	originalCanvasSize?: TCanvasSize | null;
	background: TBackground;
	/** Project colour space (PS-07); HDR ones need the HDR pipeline (section 24). */
	colorSpace?: TProjectColorSpace;
	/** Export audio format (PS-09). */
	audio?: { sampleRate: 44100 | 48000; channels: 1 | 2 };
	/** Tone mapping for HDR footage, project-wide and per media (HD-05, HD-08). */
	hdr?: ProjectHdrSettings;
	/** How clips stack (PS-08): a magnetic main track, or all tracks equal. */
	arrangeLayers?: "main" | "free";
	/** Per-project defaults (PS-17 – PS-23). */
	defaults?: TProjectDefaults;
}

export type TProjectColorSpace = "rec709" | "rec2020" | "hlg" | "pq";

export interface TProjectDefaults {
	stillSeconds?: number;
	transitionSeconds?: number;
	captionLanguage?: string;
	inputMode?: "en" | "si" | "ta";
	autosaveSeconds?: number;
	exportPreset?: string;
}

export interface TTimelineViewState {
	zoomLevel: number;
	scrollLeft: number;
	playheadTime: MediaTime;
}

export interface TProject {
	metadata: TProjectMetadata;
	scenes: TScene[];
	currentSceneId: string;
	settings: TProjectSettings;
	version: number;
	timelineViewState?: TTimelineViewState;
}

export type TProjectSortKey = "createdAt" | "updatedAt" | "name" | "duration";
export type TSortOrder = "asc" | "desc";
export type TProjectSortOption = `${TProjectSortKey}-${TSortOrder}`;
