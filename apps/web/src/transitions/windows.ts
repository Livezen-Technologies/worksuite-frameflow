import type { ClipTransition } from "./types";

/** Minimal clip shape the timing needs. Times are in ticks. */
export interface TimedClip {
	id: string;
	startTime: number;
	duration: number;
	transitionIn?: ClipTransition;
}

export interface TransitionWindow {
	transition: ClipTransition;
	/** Ticks. */
	start: number;
	end: number;
	fromId: string;
	toId: string;
}

export interface ClipTransitionTiming {
	/** Transition into this clip, if any. */
	in?: TransitionWindow;
	/** Transition out of this clip, if any. */
	out?: TransitionWindow;
	/** Ticks the clip is drawn before its start / after its end, holding its first / last frame. */
	holdBefore: number;
	holdAfter: number;
}

/** Clips closer than this count as touching (half a frame at 60 fps). */
export function cutTolerance(ticksPerSecond: number): number {
	return ticksPerSecond / 120;
}

/**
 * The window of each transition on one track. A transition applies only
 * where the previous clip ends exactly where this one starts. Its length is
 * capped so it never runs past the start of the previous clip or the end of
 * the next one.
 */
export function computeTransitionTimings({
	clips,
	ticksPerSecond,
}: {
	clips: TimedClip[];
	ticksPerSecond: number;
}): Map<string, ClipTransitionTiming> {
	const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
	const timings = new Map<string, ClipTransitionTiming>(
		sorted.map((clip) => [clip.id, { holdBefore: 0, holdAfter: 0 }]),
	);
	const tolerance = cutTolerance(ticksPerSecond);

	for (let i = 1; i < sorted.length; i++) {
		const from = sorted[i - 1];
		const to = sorted[i];
		const transition = to.transitionIn;
		if (!transition || transition.duration <= 0) continue;
		const cut = to.startTime;
		if (Math.abs(from.startTime + from.duration - cut) > tolerance) continue;

		const wanted = transition.duration * ticksPerSecond;
		const before =
			transition.alignment === "start"
				? 0
				: transition.alignment === "end"
					? 1
					: 0.5;
		// Never reach past the far edges of either clip.
		const maxLength = Math.min(
			before > 0 ? from.duration / before : Number.POSITIVE_INFINITY,
			before < 1 ? to.duration / (1 - before) : Number.POSITIVE_INFINITY,
		);
		const length = Math.min(wanted, maxLength);
		if (length <= 0) continue;

		const window: TransitionWindow = {
			transition,
			start: cut - length * before,
			end: cut + length * (1 - before),
			fromId: from.id,
			toId: to.id,
		};
		const fromTiming = timings.get(from.id)!;
		const toTiming = timings.get(to.id)!;
		fromTiming.out = window;
		fromTiming.holdAfter = Math.max(0, window.end - cut);
		toTiming.in = window;
		toTiming.holdBefore = Math.max(0, cut - window.start);
	}
	return timings;
}

/** Previous clip on the same track that ends exactly at `clip`'s start. */
export function findClipBefore<T extends TimedClip>({
	clips,
	clip,
	ticksPerSecond,
}: {
	clips: T[];
	clip: TimedClip;
	ticksPerSecond: number;
}): T | null {
	const tolerance = cutTolerance(ticksPerSecond);
	return (
		clips.find(
			(other) =>
				other.id !== clip.id &&
				Math.abs(other.startTime + other.duration - clip.startTime) <=
					tolerance,
		) ?? null
	);
}
