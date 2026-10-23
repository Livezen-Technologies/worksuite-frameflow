import type { SceneTracks, TimelineElement, VideoElement } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MediaTime brands integer ticks
const ticks = (value: number) => Math.round(value) as MediaTime;

/** One piece [from, to) of a clip, keeping its source times right. */
export function clipPiece<T extends TimelineElement>({
	element,
	from,
	to,
	id,
}: {
	element: T;
	from: number;
	to: number;
	id: string;
}): T {
	const rate = "retime" in element && element.retime?.rate ? element.retime.rate : 1;
	const s = element.startTime;
	const e = element.startTime + element.duration;
	return {
		...element,
		id,
		startTime: ticks(from),
		duration: ticks(to - from),
		trimStart: ticks(element.trimStart + (from - s) * rate),
		trimEnd: ticks(element.trimEnd + (e - to) * rate),
	};
}

/**
 * Where to put a video so the subject at `x` (0–1 across the source) is
 * centred in the frame, scaled to fill it (vertical reframing, AI-53).
 */
export function reframeParams({
	aspect,
	frame,
	x,
}: {
	/** Source width ÷ height. */
	aspect: number;
	frame: { width: number; height: number };
	x: number;
}): { scale: number; positionX: number } {
	const frameAspect = frame.width / frame.height;
	// Media is drawn contained in the frame at scale 1.
	const baseWidth = aspect > frameAspect ? frame.width : frame.height * aspect;
	const baseHeight = baseWidth / aspect;
	const scale = Math.max(1, frame.width / baseWidth, frame.height / baseHeight);
	const width = baseWidth * scale;
	const slack = Math.max(0, (width - frame.width) / 2);
	const positionX = Math.max(-slack, Math.min(slack, (0.5 - x) * width));
	return { scale, positionX };
}

/**
 * Splits the main track's video at [start, end) and reframes the middle
 * piece. Returns new tracks (one undo step for the caller).
 */
export function applyReframe({
	tracks,
	start,
	end,
	x,
	frame,
	aspectOf,
	makeId,
}: {
	tracks: SceneTracks;
	start: number;
	end: number;
	x: number;
	frame: { width: number; height: number };
	aspectOf: (element: VideoElement) => number;
	makeId: () => string;
}): SceneTracks {
	const elements: SceneTracks["main"]["elements"] = [];
	for (const element of tracks.main.elements) {
		const s = element.startTime;
		const e = s + element.duration;
		if (element.type !== "video" || e <= start || s >= end) {
			elements.push(element);
			continue;
		}
		const a = Math.max(s, start);
		const b = Math.min(e, end);
		if (a > s) elements.push(clipPiece({ element, from: s, to: a, id: element.id }));
		const middle = clipPiece({ element, from: a, to: b, id: a > s ? makeId() : element.id });
		const { scale, positionX } = reframeParams({ aspect: aspectOf(element), frame, x });
		elements.push({
			...middle,
			params: {
				...middle.params,
				"transform.scaleX": scale,
				"transform.scaleY": scale,
				"transform.positionX": positionX,
			},
		});
		if (b < e) elements.push(clipPiece({ element, from: b, to: e, id: makeId() }));
	}
	return {
		...tracks,
		main: { ...tracks.main, elements },
	};
}
