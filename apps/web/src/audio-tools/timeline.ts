import { clipPiece } from "@/ai-suggest/reframe";
import type { ScalarChannel } from "@/animation/types";
import type {
	AudioTrack,
	SceneTracks,
	TimelineElement,
} from "@/timeline/types";
import type { MediaTime } from "@/wasm";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MediaTime brands integer ticks
const ticks = (value: number) => Math.round(value) as MediaTime;

/**
 * Silence trim on the timeline (AR-17): the clip becomes the kept source
 * ranges placed back to back, and later clips on the same track move up
 * by what was removed. Other tracks are left alone.
 */
export function applyKeepRanges({
	tracks,
	trackId,
	elementId,
	keep,
	ticksPerSecond,
	makeId,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
	/** Source seconds to keep, in order. */
	keep: [number, number][];
	ticksPerSecond: number;
	makeId: () => string;
}): SceneTracks {
	const edit = (track: AudioTrack): AudioTrack => {
		const element = track.elements.find((e) => e.id === elementId);
		if (!element) return track;
		const rate = element.retime?.rate ?? 1;
		const srcStart = element.trimStart / ticksPerSecond;
		const srcEnd = srcStart + (element.duration / ticksPerSecond) * rate;
		const ranges = keep
			.map(
				([a, b]) =>
					[Math.max(a, srcStart), Math.min(b, srcEnd)] as [number, number],
			)
			.filter(([a, b]) => b - a > 0.05);
		if (!ranges.length) return track;
		const pieces: TimelineElement[] = [];
		let cursor: number = element.startTime;
		ranges.forEach(([a, b], index) => {
			// Timeline position of this source range inside the original clip.
			const from = element.startTime + ((a - srcStart) / rate) * ticksPerSecond;
			const to = element.startTime + ((b - srcStart) / rate) * ticksPerSecond;
			const piece = clipPiece({
				element,
				from,
				to,
				id: index === 0 ? element.id : makeId(),
			});
			pieces.push({ ...piece, startTime: ticks(cursor) });
			cursor += to - from;
		});
		const removed = element.startTime + element.duration - cursor;
		const end = element.startTime + element.duration;
		const others = track.elements
			.filter((e) => e.id !== elementId)
			.map((e) =>
				e.startTime >= end
					? { ...e, startTime: ticks(e.startTime - removed) }
					: e,
			);
		return {
			...track,
			elements: [...others, ...pieces]
				.filter((e): e is AudioTrack["elements"][number] => e.type === "audio")
				.sort((x, y) => x.startTime - y.startTime),
		};
	};
	return {
		...tracks,
		audio: tracks.audio.map((t) => (t.id === trackId ? edit(t) : t)),
	};
}

/**
 * Auto-duck keys for one music clip (AR-16): duck keys in timeline seconds
 * become a volume channel relative to the clip, on top of its own volume.
 */
export function duckChannel({
	element,
	keys,
	baseDb,
	ticksPerSecond,
	makeId,
}: {
	element: TimelineElement;
	keys: { time: number; db: number }[];
	baseDb: number;
	ticksPerSecond: number;
	makeId: () => string;
}): ScalarChannel | null {
	const start = element.startTime / ticksPerSecond;
	const end = start + element.duration / ticksPerSecond;
	const inside = keys.filter((k) => k.time >= start && k.time <= end);
	if (!inside.length) return null;
	// Value just before the first key, so the clip starts at the right level.
	const before = [...keys].reverse().find((k) => k.time < start);
	const all = [...(before ? [{ time: start, db: before.db }] : []), ...inside];
	return {
		keys: all.map((k) => ({
			id: makeId(),
			time: ticks((k.time - start) * ticksPerSecond),
			value: baseDb + k.db,
			segmentToNext: "linear",
			tangentMode: "auto",
		})),
	};
}
