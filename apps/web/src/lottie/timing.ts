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
}: {
	clipTime: number;
	trimStart: number;
	speed: number;
	fps: number;
	frames: number;
	loop: boolean;
	ticksPerSecond: number;
}): number {
	if (frames <= 0 || fps <= 0) return 0;
	const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
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
