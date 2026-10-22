"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type CameraBrand, identifyFootage } from "./cameras";

export interface DetectedCamera {
	brand: CameraBrand;
	model?: string;
	/** From the file, or from the user's remembered answer; null = ask. */
	profile: string | null;
}

interface FootageStore {
	/** Camera per media asset id, once scanned. `null` = no known camera. */
	byMedia: Record<string, DetectedCamera | null>;
	setCamera: (args: { mediaId: string; camera: DetectedCamera | null }) => void;
}

export const useFootageCameras = create<FootageStore>()(
	persist(
		(set) => ({
			byMedia: {},
			setCamera: ({ mediaId, camera }) =>
				set((s) => ({ byMedia: { ...s.byMedia, [mediaId]: camera } })),
		}),
		{ name: "frameflow-footage-cameras" },
	),
);

const CHUNK = 2 * 1024 * 1024;

/**
 * Reads the start and end of a video (MP4 metadata can be at either end)
 * and looks for the camera's make, model and profile (WS-36, WS-45).
 */
export async function detectCamera(file: File): Promise<DetectedCamera | null> {
	const head = new Uint8Array(await file.slice(0, CHUNK).arrayBuffer());
	const tail =
		file.size > CHUNK
			? new Uint8Array(
					await file.slice(Math.max(CHUNK, file.size - CHUNK)).arrayBuffer(),
				)
			: new Uint8Array();
	const a = identifyFootage(head);
	const b = identifyFootage(tail);
	const brand = a.brand ?? b.brand;
	if (!brand) return null;
	const model = a.camera?.model ?? b.camera?.model;
	return {
		brand,
		...(model ? { model } : {}),
		profile: a.profile ?? b.profile ?? null,
	};
}
