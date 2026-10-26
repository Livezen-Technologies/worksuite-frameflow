import { estimateWords } from "@/captions/words";
import { anchorFor } from "@/captions/anchor";
import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
} from "@/commands";
import { RemoveTrackCommand } from "@/commands/timeline/track/remove-track";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue } from "./types";

export function insertCaptionChunksAsTextTrack({
	editor,
	captions,
	narrationTrackId = null,
	replaceTrackId = null,
}: {
	editor: EditorCore;
	captions: SubtitleCue[];
	/** A caption track to remove in the same undo step (a rebuild). */
	replaceTrackId?: string | null;
	/** The track the speech is on (AI-44); null searches all audio. */
	narrationTrackId?: string | null;
}): string | null {
	if (captions.length === 0) {
		return null;
	}

	const addTrackCommand = new AddTrackCommand({ type: "text", index: 0 });
	const trackId = addTrackCommand.getTrackId();
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const tracks = editor.scenes.getActiveScene().tracks;
	const insertCommands = captions.map((caption, index) => {
		// Imported subtitles have no word timings: estimate them by length (AI-46).
		const timed = caption.words?.length
			? caption
			: {
					...caption,
					words: estimateWords({
						text: caption.text,
						start: caption.startTime,
						end: caption.startTime + caption.duration,
					}),
				};
		const element = buildSubtitleTextElement({ index, caption: timed, canvasSize });
		// Each caption remembers the speech it belongs to (AI-45).
		const captionAnchor = anchorFor({
			tracks,
			start: element.startTime,
			end: element.startTime + element.duration,
			trackId: narrationTrackId,
		});
		return new InsertElementCommand({
			placement: { mode: "explicit", trackId },
			element: captionAnchor ? { ...element, captionAnchor } : element,
		});
	});
	editor.command.execute({
		command: new BatchCommand([
			...(replaceTrackId && allTracksOf(tracks).some((t) => t.id === replaceTrackId)
				? [new RemoveTrackCommand(replaceTrackId)]
				: []),
			addTrackCommand,
			...insertCommands,
		]),
	});

	return trackId;
}

function allTracksOf(tracks: { overlay: { id: string }[]; main: { id: string }; audio: { id: string }[] }) {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}
