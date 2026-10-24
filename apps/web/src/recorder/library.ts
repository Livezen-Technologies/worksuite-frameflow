"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionManifest } from "@/recording/storage";

/** One recording in the recorder's library (CT-R1). */
export interface Take {
	id: string;
	path: string;
	name: string;
	bytes: number;
	duration: number;
	mode: SessionManifest["mode"];
	markers: number;
	thumbnail: string | null;
	createdAt: number;
	session: SessionManifest;
}

export const useRecorderLibrary = create<{
	takes: Take[];
	add: (take: Take) => void;
	remove: (id: string) => void;
}>()(
	persist(
		(set) => ({
			takes: [],
			add: (take) => set((s) => ({ takes: [take, ...s.takes.filter((t) => t.id !== take.id)].slice(0, 500) })),
			remove: (id) => set((s) => ({ takes: s.takes.filter((t) => t.id !== id) })),
		}),
		{ name: "frameflow-recorder-library" },
	),
);

/** Recorder-window preferences (CT-R2, CT-R4). */
export const useRecorderPrefs = create<{
	folder: string | null;
	encoder: "auto" | "sw";
	highlightClicks: boolean;
	set: (patch: Partial<{ folder: string | null; encoder: "auto" | "sw"; highlightClicks: boolean }>) => void;
}>()(
	persist(
		(set) => ({ folder: null, encoder: "auto", highlightClicks: true, set: (patch) => set(patch) }),
		{ name: "frameflow-recorder-prefs", partialize: ({ set: _set, ...rest }) => rest },
	),
);

/** A small JPEG of the take's first second, for the library. */
export async function thumbnailOf(file: Blob): Promise<string | null> {
	const url = URL.createObjectURL(file);
	try {
		const video = document.createElement("video");
		video.muted = true;
		video.src = url;
		await new Promise<void>((resolve, reject) => {
			video.onloadeddata = () => resolve();
			video.onerror = () => reject(new Error("unreadable"));
			setTimeout(() => reject(new Error("timeout")), 5000);
		});
		video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
		await new Promise<void>((resolve) => {
			video.onseeked = () => resolve();
			setTimeout(resolve, 1500);
		});
		const canvas = document.createElement("canvas");
		canvas.width = 192;
		canvas.height = Math.round((192 * (video.videoHeight || 9)) / (video.videoWidth || 16));
		canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/jpeg", 0.7);
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(url);
	}
}
