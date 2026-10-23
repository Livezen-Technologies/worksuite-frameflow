"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { isVisualElement } from "@/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import { findReframeEffect, withReframe } from "../projection";
import { scanFile, useSphereStore } from "../store";

/**
 * Finds 360° videos on import (VR-01) and gives their clips a virtual
 * camera (VR-08). In a 360° project the camera keeps the sphere (VR-15).
 */
export function SphereWatcher() {
	const editor = useEditor();
	const media = useEditor((e) => e.media.getAssets());
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id);
	const tracks = useEditor(
		(e) => e.scenes.getActiveSceneOrNull()?.tracks ?? null,
	);
	const byMedia = useSphereStore((s) => s.byMedia);
	const handled = useSphereStore((s) => s.handledElements);
	const sphereProject = useSphereStore((s) =>
		projectId ? !!s.sphereProjects[projectId] : false,
	);
	const scanning = useRef(new Set<string>());

	useEffect(() => {
		for (const asset of media) {
			if (
				asset.type !== "video" ||
				asset.id in byMedia ||
				scanning.current.has(asset.id)
			)
				continue;
			scanning.current.add(asset.id);
			void scanFile({
				file: asset.file,
				width: asset.width,
				height: asset.height,
			})
				.then((info) => {
					useSphereStore.getState().setInfo({ mediaId: asset.id, info });
					if (info.is360) {
						toast.info(`${asset.name} is a 360° video`, {
							description:
								"Its clips get a 360° camera: drag the preview to aim, or open the 360° tab.",
						});
					}
				})
				.finally(() => scanning.current.delete(asset.id));
		}
	}, [media, byMedia]);

	useEffect(() => {
		if (!tracks) return;
		const updates = [...tracks.overlay, tracks.main].flatMap((track) =>
			track.elements.flatMap((element) => {
				if (!isVisualElement(element) || handled[element.id]) return [];
				const mediaId = "mediaId" in element ? element.mediaId : null;
				if (!mediaId || !byMedia[mediaId]?.is360) return [];
				if (findReframeEffect(element.effects)) return [];
				return [
					{
						trackId: track.id,
						elementId: element.id,
						patch: {
							effects: withReframe({
								effects: element.effects,
								makeId: generateUUID,
								params: sphereProject ? { mode: "sphere" } : {},
							}),
						},
					},
				];
			}),
		);
		if (updates.length === 0) return;
		useSphereStore.getState().markHandled(updates.map((u) => u.elementId));
		editor.timeline.updateElements({ updates });
	}, [tracks, byMedia, handled, sphereProject, editor.timeline]);

	return null;
}
