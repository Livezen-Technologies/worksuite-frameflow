"use client";

import { toast } from "sonner";
import type { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";

/** What happens to a finished download (Downloader › After download). */
export type AfterDownload = "library" | "timeline" | "none";

const TYPES: Record<string, string> = {
	mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", m4v: "video/mp4",
	gif: "image/gif", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
};

/**
 * Adds a file the downloader saved to the open project's media, and with
 * "timeline" also puts it on the timeline at the playhead. A file already in
 * the project (same name and size) isn't imported twice.
 */
export async function importDownloadedFile({
	editor,
	filePath,
	mode,
}: {
	editor: EditorCore;
	filePath: string;
	mode: Exclude<AfterDownload, "none">;
}): Promise<void> {
	const tools = window.worksuite?.tools;
	if (!tools) throw new Error("Importing downloads needs the desktop app.");
	const project = editor.project.getActiveOrNull();
	if (!project) {
		toast.info("Open a project to add the download to it.", { description: filePath });
		return;
	}
	const name = filePath.split(/[\\/]/).pop() ?? "video";
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const file = new File([await tools.readSaved(filePath)], name, { type: TYPES[ext] ?? "" });

	const existing = editor.media.getAssets().find((a) => a.name === name && a.file?.size === file.size);
	const asset =
		existing ??
		(await (async () => {
			const [processed] = await processMediaAssets({ files: [file] });
			if (!processed) throw new Error(`${name} isn't a video, audio or image file FrameFlow can open.`);
			return editor.media.addMediaAsset({ projectId: project.metadata.id, asset: processed });
		})());
	if (!asset) throw new Error(`Couldn't add ${name} to the project.`);

	if (mode === "timeline") {
		editor.timeline.insertElement({
			element: buildElementFromMedia({
				mediaId: asset.id,
				mediaType: asset.type,
				name: asset.name,
				duration: mediaTimeFromSeconds({ seconds: asset.duration ?? 5 }),
				startTime: editor.playback.getCurrentTime(),
			}),
			placement: { mode: "auto" },
		});
	}
	toast.success(
		existing
			? `${name} is already in this project${mode === "timeline" ? "; added it to the timeline" : ""}`
			: mode === "timeline"
				? `Added ${name} to the timeline`
				: `Added ${name} to Media`,
	);
}
