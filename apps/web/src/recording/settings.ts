"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
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
	set: (patch: Partial<Omit<RecordingSettings, "set">>) => void;
}

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
			set: (patch) => set(patch),
		}),
		{
			name: "frameflow-recording-settings",
			partialize: ({ sourceId: _sourceId, set: _set, ...rest }) => rest,
		},
	),
);
