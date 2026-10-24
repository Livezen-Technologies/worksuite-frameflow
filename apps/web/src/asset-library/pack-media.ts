import type { EditorCore } from "@/core";
import { animatedImageDuration } from "@/media/animated-image";
import { processMediaAssets } from "@/media/processing";
import { defaultStillDuration } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import { packItemFile } from "./pack-items";
import type { PackContentItem } from "./registry";

/**
 * Adds a downloaded graphic or sticker to the project's media and to the
 * timeline at the playhead on its own layer (like a GIF from Elements).
 */
export async function insertPackMedia({ editor, item }: { editor: EditorCore; item: PackContentItem }) {
	const project = editor.project.getActive();
	const file = await packItemFile({ item });
	const [processed] = await processMediaAssets({ files: [file] });
	if (!processed) throw new Error(`Couldn't read ${item.name}.`);
	const asset = await editor.media.addMediaAsset({ projectId: project.metadata.id, asset: { ...processed, name: item.name } });
	if (!asset) throw new Error(`Couldn't add ${item.name} to the project.`);
	const loop = asset.type === "image" ? await animatedImageDuration(file) : null;
	// Short loops repeat to fill at least the default still length.
	const seconds = asset.duration ?? (loop ? Math.max(loop, Math.ceil(5 / loop) * loop) : null);
	editor.timeline.insertElement({
		element: buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: item.name,
			duration: seconds ? mediaTimeFromSeconds({ seconds }) : defaultStillDuration(),
			startTime: editor.playback.getCurrentTime(),
		}),
		placement: { mode: "auto" },
	});
}
