import type { EditorCore } from "@/core";
import { animatedImageDuration } from "@/media/animated-image";
import { processMediaAssets } from "@/media/processing";
import { defaultStillDuration } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { canElementGoOnTrack } from "@/timeline/placement";
import type { ElementType } from "@/timeline";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { packItemFile } from "./pack-items";
import type { PackContentItem } from "./registry";

/**
 * Adds a downloaded graphic or sticker to the project's media and to the
 * timeline at the playhead on its own layer (like a GIF from Elements).
 */
export async function insertPackMedia({
	editor,
	item,
	startTime,
	trackId,
}: {
	editor: EditorCore;
	item: PackContentItem;
	/** Where it was dropped; the playhead otherwise. */
	startTime?: MediaTime;
	/** A track it was dropped on, used when the clip can go there. */
	trackId?: string | null;
}) {
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
			startTime: startTime ?? editor.playback.getCurrentTime(),
		}),
		placement: placementOn({ editor, trackId, elementType: asset.type }),
	});
}

/** On `trackId` when an element of `elementType` can go there; otherwise a free layer. */
export function placementOn({ editor, trackId, elementType }: { editor: EditorCore; trackId?: string | null; elementType: ElementType }): { mode: "explicit"; trackId: string } | { mode: "auto" } {
	const track = trackId ? editor.timeline.getTrackById({ trackId }) : null;
	return track && canElementGoOnTrack({ elementType, trackType: track.type }) ? { mode: "explicit", trackId: track.id } : { mode: "auto" };
}
