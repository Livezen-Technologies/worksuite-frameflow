import type { CursorLog, ScreenZoom, ZoomSegment } from "./types";

/** Smoothstep 0→1. */
const ease = (u: number) => {
	const c = Math.min(1, Math.max(0, u));
	return c * c * (3 - 2 * c);
};

/** How far into the zoom we are, 0 outside it and 1 when fully in. */
function amount({ segment, t }: { segment: ZoomSegment; t: number }): number {
	if (t <= segment.start || t >= segment.end) return 0;
	const e = Math.max(
		0.01,
		Math.min(segment.ease, (segment.end - segment.start) / 2),
	);
	return Math.min(ease((t - segment.start) / e), ease((segment.end - t) / e));
}

/**
 * Cursor position smoothed over the last ~0.5 s with exponentially fading
 * weights, so following the cursor never jitters (SC-14). Stateless, so
 * scrubbing and export give the same picture as playback.
 */
export function smoothedCursor({
	log,
	t,
	window = 0.5,
}: {
	log: CursorLog;
	t: number;
	window?: number;
}): {
	x: number;
	y: number;
} | null {
	const samples = log.samples;
	if (!samples.length) return null;
	// Binary search for the last sample at or before t.
	let lo = 0;
	let hi = samples.length - 1;
	if (samples[0][0] > t) return { x: samples[0][1], y: samples[0][2] };
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (samples[mid][0] <= t) lo = mid;
		else hi = mid - 1;
	}
	let wx = 0;
	let wy = 0;
	let w = 0;
	// The pointer stays at a sample until the next one, so weight by time held.
	let until = t;
	for (let i = lo; i >= 0; i--) {
		const [st, x, y] = samples[i];
		const from = Math.max(st, t - window);
		const held = until - from;
		if (held > 0) {
			const age = t - (from + until) / 2;
			const weight = held * Math.exp(-age / (window / 3));
			wx += x * weight;
			wy += y * weight;
			w += weight;
		}
		until = st;
		if (st <= t - window) break;
	}
	if (w === 0) return { x: samples[lo][1], y: samples[lo][2] };
	return { x: wx / w, y: wy / w };
}

/** Keep the zoomed view inside the frame: focus can't come closer to an edge than half the view. */
function clampFocus({ v, scale }: { v: number; scale: number }): number {
	const half = 0.5 / scale;
	return Math.min(1 - half, Math.max(half, v));
}

/** Zoom level and focus point (0–1) at a source time. */
export function screenZoomAt({
	zoom,
	seconds,
}: {
	zoom: ScreenZoom;
	seconds: number;
}): {
	scale: number;
	x: number;
	y: number;
} {
	for (const segment of zoom.segments) {
		const a = amount({ segment, t: seconds });
		if (a <= 0) continue;
		const scale = 1 + (segment.level - 1) * a;
		let x = segment.x;
		let y = segment.y;
		if (segment.follow && zoom.log) {
			const cursor = smoothedCursor({ log: zoom.log, t: seconds });
			if (cursor) {
				x = cursor.x;
				y = cursor.y;
			}
		}
		return {
			scale,
			x: clampFocus({ v: x, scale }),
			y: clampFocus({ v: y, scale }),
		};
	}
	return { scale: 1, x: 0.5, y: 0.5 };
}

/** Shift that keeps the focus point fixed on screen while scaling by `scale` around the clip centre. */
export function zoomOffset({
	scale,
	x,
	y,
	width,
	height,
}: {
	scale: number;
	x: number;
	y: number;
	width: number;
	height: number;
}): { dx: number; dy: number } {
	return {
		dx: (0.5 - x) * width * (scale - 1),
		dy: (0.5 - y) * height * (scale - 1),
	};
}
