import type { TimelineTrack } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";

import type { CaptionCue } from "./caption-files";

export { cuesToSrt, cuesToVtt, type CaptionCue } from "./caption-files";

const CAPTION_NAME = /^Caption \d+$/;

/** Text tracks made by captioning: every clip on them is named "Caption N". */
export function isCaptionTrack(track: TimelineTrack): boolean {
	return (
		track.type === "text" &&
		track.elements.length > 0 &&
		track.elements.every((element) => CAPTION_NAME.test(element.name))
	);
}

/** One list per caption track, in seconds, sorted by start. */
export function captionTracksToCues(tracks: TimelineTrack[]): CaptionCue[][] {
	return tracks.filter(isCaptionTrack).map((track) =>
		track.elements
			.map((element) => ({
				start: element.startTime / TICKS_PER_SECOND,
				end: (element.startTime + element.duration) / TICKS_PER_SECOND,
				text: String(element.type === "text" ? element.params.content : ""),
			}))
			.filter((cue) => cue.text.trim() !== "")
			.sort((a, b) => a.start - b.start),
	);
}
