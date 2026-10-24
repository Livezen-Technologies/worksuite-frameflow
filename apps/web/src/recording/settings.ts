"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CaptureArea } from "./area";
import { DEFAULT_PROTECTED } from "./privacy";
import type { QualityProfile, RecordingMode } from "./preflight";

/** Remembered recording choices (AR-02). */
export interface RecordingSettings {
	mode: RecordingMode;
	micId: string | null;
	cameraId: string | null;
	sourceId: string | null;
	channelCount: 1 | 2;
	profile: QualityProfile;
	countdown: number;
	muteTimeline: boolean;
	systemAudio: boolean;
	/** Global shortcuts (SC-05), Electron accelerators. */
	shortcuts: Record<"toggle" | "toggle-pause" | "marker", string>;
	/** Zoom in on clicks and typing after a screen recording (SC-11). */
	autoZoom: boolean;
	/** Part of the screen to record; null records all of it (SC-01). */
	area: CaptureArea | null;
	/** Pause while a window with one of these names is open (SC-08). */
	protectedApps: string[];
	/** Hold notifications back while recording the screen (SC-08). */
	doNotDisturb: boolean;
	/** Smart zoom strength (1.25–4×) and whether it follows the cursor. */
	zoomLevel: number;
	zoomFollow: boolean;
	/** How the camera sits over the screen recording in the editor. */
	camera: CameraOverlay;
	/** Live highlights drawn into the screen recording. */
	cursorHalo: boolean;
	clickColor: string;
	clickSize: number;
	set: (patch: Partial<Omit<RecordingSettings, "set">>) => void;
}

export type CameraShape = "circle" | "rounded" | "square" | "original";
export type CameraCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export interface CameraOverlay {
	shape: CameraShape;
	/** Width as a percentage of the video (10–50). */
	size: number;
	corner: CameraCorner;
	/** White border width in pixels, 0 for none. */
	border: number;
}

export const DEFAULT_CAMERA_OVERLAY: CameraOverlay = { shape: "circle", size: 22, corner: "bottom-right", border: 4 };

export const useRecordingSettings = create<RecordingSettings>()(
	persist(
		(set) => ({
			mode: "voiceover",
			micId: null,
			cameraId: null,
			sourceId: null,
			channelCount: 1,
			profile: "standard",
			countdown: 3,
			muteTimeline: true,
			systemAudio: false,
			shortcuts: {
				toggle: "CommandOrControl+Shift+R",
				"toggle-pause": "CommandOrControl+Shift+P",
				marker: "CommandOrControl+Shift+M",
			},
			autoZoom: true,
			area: null,
			protectedApps: DEFAULT_PROTECTED,
			doNotDisturb: true,
			zoomLevel: 2,
			zoomFollow: true,
			camera: DEFAULT_CAMERA_OVERLAY,
			cursorHalo: false,
			clickColor: "#ffc400",
			clickSize: 56,
			set: (patch) => set(patch),
		}),
		{
			name: "frameflow-recording-settings",
			partialize: ({ sourceId: _sourceId, set: _set, ...rest }) => rest,
		},
	),
);
