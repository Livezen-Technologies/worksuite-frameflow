"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { useRecordingSettings } from "@/recording/settings";
import { defaultStillDuration } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { addMediaTime, mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { useStartIntent } from "../intent";

/** Carries out the startup screen's choice once the new project has opened. */
export function StartIntentHost() {
	const editor = useEditor();
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id ?? null);

	useEffect(() => {
		if (!projectId) return;
		const intent = useStartIntent.getState().take(projectId);
		if (!intent) return;
		if (intent.kind === "record") {
			useRecordingSettings.getState().set({ mode: "screen" });
			useAssetsPanelStore.getState().setActiveTab("record");
			return;
		}
		if (intent.kind === "motion" || intent.kind === "templates") {
			useAssetsPanelStore.getState().setActiveTab(intent.kind);
			return;
		}
		void (async () => {
			try {
				const assets = await processMediaAssets({ files: intent.files });
				let at = ZERO_MEDIA_TIME;
				for (const processed of assets) {
					const asset = await editor.media.addMediaAsset({ projectId, asset: processed });
					if (!asset) continue;
					const duration =
						asset.duration != null ? mediaTimeFromSeconds({ seconds: asset.duration }) : defaultStillDuration();
					editor.timeline.insertElement({
						element: buildElementFromMedia({
							mediaId: asset.id,
							mediaType: asset.type,
							name: asset.name,
							duration,
							startTime: at,
						}),
						placement: { mode: "auto" },
					});
					if (asset.type !== "audio") at = addMediaTime({ a: at, b: duration });
				}
				if (assets.length)
					toast.success(`Added ${assets.length} file${assets.length === 1 ? "" : "s"} to the timeline`);
			} catch (error) {
				toast.error("Couldn't import the dropped files", {
					description: error instanceof Error ? error.message : String(error),
				});
			}
		})();
	}, [editor, projectId]);

	return null;
}
