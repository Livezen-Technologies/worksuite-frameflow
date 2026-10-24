/**
 * The Lottie frame to draw for a moment in a clip. Times are media ticks.
 *
 * The clip starts `trimStart` into the animation, plays at `speed`, and
 * either loops or holds its last frame once the animation ends.
 */
export function lottieFrameAtClipTime({
	clipTime,
	trimStart,
	speed,
	fps,
	frames,
	loop,
	ticksPerSecond,
	timing,
}: {
	clipTime: number;
	trimStart: number;
	speed: number;
	fps: number;
	frames: number;
	loop: boolean;
	ticksPerSecond: number;
	/** Motion Editor timing (seconds): wait `delay`, play `trimIn`..end−`trimOut`. */
	timing?: MotionTiming;
}): number {
	if (frames <= 0 || fps <= 0) return 0;
	const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
	if (timing && (timing.delay || timing.trimIn || timing.trimOut)) {
		const clipSeconds = (Math.max(0, trimStart) + Math.max(0, clipTime)) / ticksPerSecond;
		return motionTimingFrame({ clipSeconds, speed: rate, fps, frames, loop, timing });
	}
	const seconds =
		(Math.max(0, trimStart) + Math.max(0, clipTime) * rate) / ticksPerSecond;
	const frame = seconds * fps;
	if (loop) {
		const wrapped = frame % frames;
		return wrapped < 0 ? wrapped + frames : wrapped;
	}
	// The last drawable frame sits just before the out point.
	return Math.min(frame, Math.max(0, frames - 1));
}

/** Natural clip length in ticks for an animation played once at `speed`. */
export function lottieDurationTicks({
	fps,
	frames,
	speed = 1,
	ticksPerSecond,
}: {
	fps: number;
	frames: number;
	speed?: number;
	ticksPerSecond: number;
}): number {
	return Math.round(((frames / fps) * ticksPerSecond) / (speed > 0 ? speed : 1));
}

export interface MotionTiming {
	delay?: number;
	endHold?: number;
	trimIn?: number;
	trimOut?: number;
}

/** The animation frame `clipSeconds` into a clip with Motion Editor timing. */
export function motionTimingFrame({
	clipSeconds,
	speed,
	fps,
	frames,
	loop,
	timing,
}: {
	clipSeconds: number;
	speed: number;
	fps: number;
	frames: number;
	loop: boolean;
	timing: MotionTiming;
}): number {
	const total = frames / fps;
	const start = Math.min(Math.max(0, timing.trimIn ?? 0), total);
	const end = Math.max(start + 1 / fps, total - Math.max(0, timing.trimOut ?? 0));
	const length = end - start;
	const t = (clipSeconds - Math.max(0, timing.delay ?? 0)) * speed;
	if (t <= 0) return start * fps;
	const into = loop ? t % length : Math.min(t, length - 1 / fps);
	return (start + into) * fps;
}

/** Clip length (seconds) that plays a timed animation once, with its end hold. */
export function motionTimingDuration({ fps, frames, speed, timing }: { fps: number; frames: number; speed: number; timing?: MotionTiming }): number {
	const total = frames / fps;
	const length = Math.max(1 / fps, total - Math.max(0, timing?.trimIn ?? 0) - Math.max(0, timing?.trimOut ?? 0));
	return Math.max(0, timing?.delay ?? 0) + length / (speed > 0 ? speed : 1) + Math.max(0, timing?.endHold ?? 0);
}
