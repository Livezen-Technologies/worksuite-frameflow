import { clipPiece } from "@/ai-suggest/reframe";
import type { AudioTake, SceneTracks, UploadAudioElement } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MediaTime brands integer ticks
const ticks = (value: number) => Math.round(value) as MediaTime;

/** Points the clip at one of its takes (AR-06). */
export function withTake({
	element,
	index,
}: {
	element: UploadAudioElement;
	index: number;
}): UploadAudioElement {
	const take = element.takes?.[index];
	if (!take) return element;
	return {
		...element,
		mediaId: take.mediaId,
		trimStart: take.trimStart,
		trimEnd: take.trimEnd,
		activeTake: index,
	};
}

/**
 * Punch-in (AR-05, AR-06): the new take replaces [start, end) on the audio
 * track already holding sound there. What it covered is kept as take 1 when
 * one clip spanned the whole range, and recording again over the same range
 * adds another take to the same clip. Returns null when no audio track has
 * sound in the range (the take is then placed like any recording).
 */
export function punchIn({
	tracks,
	start,
	end,
	take,
	makeId,
}: {
	tracks: SceneTracks;
	/** Ticks. */
	start: number;
	end: number;
	/** The recording as a clip at `start`, and its full length in ticks. */
	take: { element: UploadAudioElement; length: number };
	makeId: () => string;
}): { tracks: SceneTracks; elementId: string } | null {
	const overlaps = (e: { startTime: number; duration: number }) =>
		e.startTime < end && e.startTime + e.duration > start;
	const track = tracks.audio.find((t) => t.elements.some(overlaps));
	if (!track) return null;
	const newTake: AudioTake = {
		label: "",
		mediaId: take.element.mediaId,
		trimStart: ticks(0),
		trimEnd: ticks(Math.max(0, take.length - (end - start))),
	};
	const same = track.elements.find(
		(e): e is UploadAudioElement =>
			e.sourceType === "upload" &&
			!!e.takes?.length &&
			e.startTime === start &&
			e.duration === end - start,
	);
	let elements: typeof track.elements;
	let elementId: string;
	if (same) {
		const takes = [...(same.takes ?? []), { ...newTake, label: `Take ${(same.takes?.length ?? 0) + 1}` }];
		elementId = same.id;
		elements = track.elements.map((e) =>
			e.id === same.id ? withTake({ element: { ...same, takes }, index: takes.length - 1 }) : e,
		);
	} else {
		const covering = track.elements.find(
			(e): e is UploadAudioElement =>
				e.sourceType === "upload" && e.startTime <= start && e.startTime + e.duration >= end,
		);
		const takes: AudioTake[] = [];
		if (covering) {
			const middle = clipPiece({ element: covering, from: start, to: end, id: "" });
			takes.push({
				label: "Take 1",
				mediaId: covering.mediaId,
				trimStart: middle.trimStart,
				trimEnd: middle.trimEnd,
			});
		}
		takes.push({ ...newTake, label: `Take ${takes.length + 1}` });
		elementId = makeId();
		// Same level and mute as what it replaces, so takes compare fairly.
		const base: UploadAudioElement = {
			...take.element,
			params: covering ? { ...take.element.params, ...covering.params } : take.element.params,
			id: elementId,
			startTime: ticks(start),
			duration: ticks(end - start),
			takes,
		};
		const kept = track.elements.flatMap((e) => {
			if (!overlaps(e)) return [e];
			const s = e.startTime;
			const t = e.startTime + e.duration;
			const pieces = [];
			if (s < start) pieces.push(clipPiece({ element: e, from: s, to: start, id: e.id }));
			if (t > end) pieces.push(clipPiece({ element: e, from: end, to: t, id: s < start ? makeId() : e.id }));
			return pieces;
		});
		elements = [...kept, withTake({ element: base, index: takes.length - 1 })].sort(
			(a, b) => a.startTime - b.startTime,
		);
	}
	return {
		tracks: { ...tracks, audio: tracks.audio.map((t) => (t.id === track.id ? { ...t, elements } : t)) },
		elementId,
	};
}
