"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { isVisualElement } from "@/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import { readCameraLut, withCameraLut } from "../apply";
import { cameraKey } from "../cameras";
import { detectCamera, useFootageCameras } from "../detect";
import { cameraLutFor, useLutLibrary } from "../library";

/**
 * Scans imported videos for the camera that shot them (WS-36, WS-45) and,
 * when the user allows it, applies the matching camera LUT to their clips.
 */
export function FootageWatcher() {
	const editor = useEditor();
	const media = useEditor((e) => e.media.getAssets());
	const tracks = useEditor(
		(e) => e.scenes.getActiveSceneOrNull()?.tracks ?? null,
	);
	const byMedia = useFootageCameras((s) => s.byMedia);
	const setCamera = useFootageCameras((s) => s.setCamera);
	const autoApply = useLutLibrary((s) => s.autoApply);
	const luts = useLutLibrary((s) => s.luts);
	const cameraProfiles = useLutLibrary((s) => s.cameraProfiles);
	const scanning = useRef(new Set<string>());
	const handled = useRef(new Set<string>());

	// 1. Scan new videos once.
	useEffect(() => {
		for (const asset of media) {
			if (
				asset.type !== "video" ||
				asset.id in byMedia ||
				scanning.current.has(asset.id)
			)
				continue;
			scanning.current.add(asset.id);
			void detectCamera(asset.file)
				.then((found) => {
					if (found && !found.profile) {
						const remembered =
							cameraProfiles[
								cameraKey({
									brand: found.brand,
									model: found.model ?? found.brand,
								})
							];
						if (remembered) found.profile = remembered;
					}
					setCamera({ mediaId: asset.id, camera: found });
					if (found) {
						const name = `${found.brand} ${found.model ?? ""}`.trim();
						toast.info(
							found.profile
								? `${name} footage (${found.profile}) found.`
								: `${name} footage found. Tell FrameFlow its colour profile once.`,
							{
								action: {
									label: "Open LUTs",
									onClick: () =>
										useAssetsPanelStore.getState().setActiveTab("adjustment"),
								},
							},
						);
					}
				})
				.finally(() => scanning.current.delete(asset.id));
		}
	}, [media, byMedia, setCamera, cameraProfiles]);

	// 2. Auto-apply camera LUTs to clips that don't have one yet.
	useEffect(() => {
		if (!autoApply || !tracks) return;
		const updates = [...tracks.overlay, tracks.main, ...tracks.audio].flatMap(
			(track) =>
				track.elements.flatMap((element) => {
					if (!isVisualElement(element) || handled.current.has(element.id))
						return [];
					const mediaId = "mediaId" in element ? element.mediaId : null;
					const camera = mediaId ? byMedia[mediaId] : null;
					if (!camera?.profile || readCameraLut(element.effects)) return [];
					const lut = cameraLutFor({
						brand: camera.brand,
						model: camera.model,
						profile: camera.profile,
					});
					if (!lut) return [];
					handled.current.add(element.id);
					return [
						{
							trackId: track.id,
							elementId: element.id,
							patch: {
								effects: withCameraLut({
									effects: element.effects,
									lutId: lut.id,
									makeId: generateUUID,
								}),
							},
						},
					];
				}),
		);
		if (updates.length > 0) {
			editor.timeline.updateElements({ updates });
			toast.success(
				`Applied camera LUT to ${updates.length} clip${updates.length === 1 ? "" : "s"}`,
			);
		}
	}, [autoApply, tracks, byMedia, luts, editor.timeline]);

	return null;
}
