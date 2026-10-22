import type { MediaTime } from "@/wasm";
import type { SceneTracks, TimelineElement, TimelineTrack } from "./types";

/** Tick arithmetic on MediaTimes stays in whole ticks. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MediaTime brands integer ticks
const ticks = (value: number) => Math.round(value) as MediaTime;

/**
 * Removes the time range [start, end) from every track and closes the gap
 * (a ripple delete across the whole timeline). Used by transcript-based
 * editing (SRS ED-17): clips inside the range go, clips across it are
 * trimmed or split, and everything after moves left. Times are in ticks.
 */
export function cutTimeRange({
	tracks,
	start,
	end,
	makeId,
}: {
	tracks: SceneTracks;
	start: number;
	end: number;
	makeId: () => string;
}): SceneTracks {
	if (!(end > start)) return tracks;
	const gap = end - start;

	const sourceSpan = ({
		element,
		clipTime,
	}: {
		element: TimelineElement;
		clipTime: number;
	}) => {
		const rate =
			"retime" in element && element.retime?.rate ? element.retime.rate : 1;
		return Math.round(clipTime * rate);
	};

	const cutElement = (element: TimelineElement): TimelineElement[] => {
		const s = element.startTime;
		const e = element.startTime + element.duration;
		if (e <= start) return [element];
		if (s >= end) return [{ ...element, startTime: ticks(s - gap) }];
		if (s >= start && e <= end) return [];

		const total = sourceSpan({ element, clipTime: e - s });
		if (s < start && e > end) {
			const keptLeft = sourceSpan({ element, clipTime: start - s });
			const skipTo = sourceSpan({ element, clipTime: end - s });
			const left = {
				...element,
				duration: ticks(start - s),
				trimEnd: ticks(element.trimEnd + (total - keptLeft)),
			};
			const right = {
				...element,
				id: makeId(),
				startTime: ticks(start),
				duration: ticks(e - end),
				trimStart: ticks(element.trimStart + skipTo),
			};
			// The cut is a jump, not a transition into this part.
			if ("transitionIn" in right) delete right.transitionIn;
			return [left, right];
		}
		if (s < start) {
			const kept = sourceSpan({ element, clipTime: start - s });
			return [
				{
					...element,
					duration: ticks(start - s),
					trimEnd: ticks(element.trimEnd + (total - kept)),
				},
			];
		}
		// Starts inside the range, ends after it.
		return [
			{
				...element,
				startTime: ticks(start),
				duration: ticks(e - end),
				trimStart: ticks(
					element.trimStart + sourceSpan({ element, clipTime: end - s }),
				),
			},
		];
	};

	const cutTrack = <T extends TimelineTrack>(track: T): T =>
		({ ...track, elements: track.elements.flatMap(cutElement) }) as T;

	return {
		overlay: tracks.overlay.map(cutTrack),
		main: cutTrack(tracks.main),
		audio: tracks.audio.map(cutTrack),
	};
}
