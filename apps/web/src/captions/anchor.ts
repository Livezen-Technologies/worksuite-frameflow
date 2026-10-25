import { getClipTimeAtSourceTime, getSourceTimeAtClipTime } from "@/retime/resolve";
import type { MediaTime } from "@/wasm";

// Same as timeline/cut-range.ts: ticks are plain numbers under the brand.
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ticks = (value: number) => Math.round(value) as MediaTime;
import type {
	RetimeConfig,
	SceneTracks,
	TextElement,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";

/**
 * Caption times stored against the source media (SRS AI-45): a caption
 * remembers which file and which part of it was being said, so trims,
 * moves, speed changes and other sequences move it with the speech.
 */
export interface CaptionAnchor {
	mediaId: string;
	/** Source time in ticks. */
	sourceStart: number;
	sourceEnd: number;
	/** The track the narration came from, tried first. */
	trackId?: string;
	/** Hidden because its speech was cut out (shown again if it returns). */
	cut?: boolean;
}

type MediaClip = Extract<TimelineElement, { mediaId: string }> & {
	retime?: RetimeConfig;
};

function allTracks(tracks: SceneTracks): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function isMediaClip(element: TimelineElement): element is MediaClip {
	return (
		(element.type === "video" || element.type === "audio") &&
		"mediaId" in element &&
		typeof element.mediaId === "string"
	);
}

function retimeOf(element: MediaClip): RetimeConfig | undefined {
	return "retime" in element ? element.retime : undefined;
}

/** Source span a clip shows, in source ticks. */
function sourceSpan(element: MediaClip): [number, number] {
	const length = getSourceTimeAtClipTime({
		clipTime: element.duration,
		retime: retimeOf(element),
		duration: element.duration,
	});
	return [element.trimStart, element.trimStart + length];
}

/**
 * Which source media and source time is heard at timeline time `time`:
 * the narration track if given, else audio tracks, then video tracks.
 */
export function sourceAt({
	tracks,
	time,
	trackId,
}: {
	tracks: SceneTracks;
	time: number;
	trackId?: string | null;
}): { mediaId: string; sourceTime: number; trackId: string } | null {
	const order = trackId
		? allTracks(tracks).filter((t) => t.id === trackId)
		: [...tracks.audio, tracks.main, ...tracks.overlay];
	for (const track of order) {
		if ("muted" in track && track.muted && !trackId) continue;
		for (const element of track.elements) {
			if (!isMediaClip(element)) continue;
			if (time < element.startTime || time >= element.startTime + element.duration) continue;
			return {
				mediaId: element.mediaId,
				trackId: track.id,
				sourceTime:
					element.trimStart +
					getSourceTimeAtClipTime({
						clipTime: time - element.startTime,
						retime: retimeOf(element),
						duration: element.duration,
					}),
			};
		}
	}
	return null;
}

/** Anchors a caption that covers [start, end) on the timeline. */
export function anchorFor({
	tracks,
	start,
	end,
	trackId,
}: {
	tracks: SceneTracks;
	start: number;
	end: number;
	trackId?: string | null;
}): CaptionAnchor | null {
	const mid = Math.round((start + end) / 2);
	const at = sourceAt({ tracks, time: mid, trackId });
	if (!at) return null;
	// Both ends measured in the same clip, so speed changes map exactly.
	const clip = allTracks(tracks)
		.find((t) => t.id === at.trackId)
		?.elements.find(
			(e): e is MediaClip =>
				isMediaClip(e) && mid >= e.startTime && mid < e.startTime + e.duration,
		);
	if (!clip) return null;
	const toSource = (t: number) =>
		clip.trimStart +
		getSourceTimeAtClipTime({
			clipTime: Math.min(Math.max(t - clip.startTime, 0), clip.duration),
			retime: retimeOf(clip),
			duration: clip.duration,
		});
	return {
		mediaId: at.mediaId,
		trackId: at.trackId,
		sourceStart: Math.round(toSource(start)),
		sourceEnd: Math.round(toSource(end)),
	};
}

/** Where an anchored caption belongs now, or null if its speech is gone. */
export function placeAnchor({
	tracks,
	anchor,
}: {
	tracks: SceneTracks;
	anchor: CaptionAnchor;
}): { startTime: number; duration: number } | null {
	let best: { startTime: number; duration: number; overlap: number; hinted: boolean } | null =
		null;
	for (const track of allTracks(tracks)) {
		for (const element of track.elements) {
			if (!isMediaClip(element) || element.mediaId !== anchor.mediaId) continue;
			const [from, to] = sourceSpan(element);
			const s = Math.max(from, anchor.sourceStart);
			const e = Math.min(to, anchor.sourceEnd);
			if (e <= s) continue;
			const retime = retimeOf(element);
			const startTime =
				element.startTime +
				getClipTimeAtSourceTime({ sourceTime: s - element.trimStart, retime, duration: element.duration });
			const endTime =
				element.startTime +
				getClipTimeAtSourceTime({ sourceTime: e - element.trimStart, retime, duration: element.duration });
			const hinted = track.id === anchor.trackId;
			const candidate = {
				startTime: Math.round(startTime),
				duration: Math.max(1, Math.round(endTime - startTime)),
				overlap: e - s,
				hinted,
			};
			if (
				!best ||
				(candidate.hinted && !best.hinted) ||
				(candidate.hinted === best.hinted && candidate.overlap > best.overlap)
			)
				best = candidate;
		}
	}
	return best ? { startTime: best.startTime, duration: best.duration } : null;
}

export type CaptionUpdate = {
	trackId: string;
	elementId: string;
	patch: Partial<TextElement>;
};

/**
 * Moves anchored captions to where their speech is now. `previous` holds
 * each caption's expected place from the last run: when the source didn't
 * move but the caption did, the user moved it, so it is re-anchored there.
 */
export function resyncCaptions({
	tracks,
	previous,
}: {
	tracks: SceneTracks;
	previous: Map<string, { startTime: number; duration: number } | null>;
}): {
	updates: CaptionUpdate[];
	expected: Map<string, { startTime: number; duration: number } | null>;
} {
	const updates: CaptionUpdate[] = [];
	const expected = new Map<string, { startTime: number; duration: number } | null>();
	for (const track of tracks.overlay) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			const anchor = element.captionAnchor;
			if (!anchor) continue;
			const place = placeAnchor({ tracks, anchor });
			const before = previous.get(element.id);
			const sourceUnchanged =
				before !== undefined &&
				((before === null && place === null) ||
					(before !== null &&
						place !== null &&
						before.startTime === place.startTime &&
						before.duration === place.duration));
			const moved =
				place !== null &&
				(Math.abs(element.startTime - place.startTime) > 1 ||
					Math.abs(element.duration - place.duration) > 1);
			if (sourceUnchanged && moved && !anchor.cut) {
				// The user moved or trimmed the caption: keep it where they put it.
				const next = anchorFor({
					tracks,
					start: element.startTime,
					end: element.startTime + element.duration,
					trackId: anchor.trackId,
				});
				if (next) {
					updates.push({ trackId: track.id, elementId: element.id, patch: { captionAnchor: next } });
					expected.set(element.id, placeAnchor({ tracks, anchor: next }));
				} else {
					expected.set(element.id, place);
				}
				continue;
			}
			expected.set(element.id, place);
			if (place === null) {
				if (!anchor.cut)
					updates.push({
						trackId: track.id,
						elementId: element.id,
						patch: { hidden: true, captionAnchor: { ...anchor, cut: true } },
					});
				continue;
			}
			if (!moved && !anchor.cut) continue;
			const scale = element.duration > 0 ? place.duration / element.duration : 1;
			updates.push({
				trackId: track.id,
				elementId: element.id,
				patch: {
					startTime: ticks(place.startTime),
					duration: ticks(place.duration),
					...(anchor.cut ? { hidden: false, captionAnchor: { ...anchor, cut: false } } : {}),
					...(element.words && scale !== 1
						? {
								words: element.words.map((w) => ({
									...w,
									start: w.start * scale,
									end: w.end * scale,
								})),
							}
						: {}),
				},
			});
		}
	}
	return { updates, expected };
}
