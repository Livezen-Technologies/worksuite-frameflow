"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { detectSphere, type SphereInfo } from "./spherical";

interface SphereStore {
	/** Per media asset, once scanned (VR-01). */
	byMedia: Record<string, SphereInfo>;
	/** Clips the camera was added to once, so removing it sticks. */
	handledElements: Record<string, true>;
	/** Projects edited and exported as 360° (VR-15). */
	sphereProjects: Record<string, true>;
	setInfo: (args: { mediaId: string; info: SphereInfo }) => void;
	markHandled: (elementIds: string[]) => void;
	setSphereProject: (args: { projectId: string; on: boolean }) => void;
	/** Preview shows a look-around view of a 360° project (VR-06). */
	lookAround: boolean;
	guides: boolean;
	setView: (patch: Partial<{ lookAround: boolean; guides: boolean }>) => void;
}

export const useSphereStore = create<SphereStore>()(
	persist(
		(set) => ({
			byMedia: {},
			handledElements: {},
			sphereProjects: {},
			lookAround: true,
			guides: true,
			setView: (patch) => set(patch),
			setInfo: ({ mediaId, info }) =>
				set((s) => ({ byMedia: { ...s.byMedia, [mediaId]: info } })),
			markHandled: (elementIds) =>
				set((s) => ({
					handledElements: {
						...s.handledElements,
						...Object.fromEntries(elementIds.map((id) => [id, true as const])),
					},
				})),
			setSphereProject: ({ projectId, on }) =>
				set((s) => {
					const next = { ...s.sphereProjects };
					if (on) next[projectId] = true;
					else delete next[projectId];
					return { sphereProjects: next };
				}),
		}),
		{ name: "frameflow-360" },
	),
);

const CHUNK = 1024 * 1024;

export async function scanFile({
	file,
	width,
	height,
}: {
	file: File;
	width?: number;
	height?: number;
}): Promise<SphereInfo> {
	const head = new Uint8Array(await file.slice(0, CHUNK).arrayBuffer());
	const tail =
		file.size > CHUNK
			? new Uint8Array(
					await file.slice(Math.max(CHUNK, file.size - CHUNK)).arrayBuffer(),
				)
			: new Uint8Array();
	return detectSphere({ fileName: file.name, head, tail, width, height });
}

export function isSphereMedia(mediaId: string | undefined | null): boolean {
	return !!mediaId && !!useSphereStore.getState().byMedia[mediaId]?.is360;
}
