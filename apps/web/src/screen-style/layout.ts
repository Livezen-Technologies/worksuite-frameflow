import type { CursorLog } from "@/screen-zoom/types";
import { smoothedCursor } from "@/screen-zoom/evaluate";

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The card the screen sits in when it has a background (SC-17): the
 * picture's usual place, shrunk by the padding around the frame centre.
 */
export function cardRect({
	canvas,
	source,
	padding,
}: {
	canvas: { width: number; height: number };
	source: { width: number; height: number };
	padding: number;
}): Rect {
	const short = Math.min(canvas.width, canvas.height);
	const pad = short * Math.min(0.3, Math.max(0, padding));
	const room = { width: canvas.width - pad * 2, height: canvas.height - pad * 2 };
	const scale = Math.min(room.width / source.width, room.height / source.height);
	const width = source.width * scale;
	const height = source.height * scale;
	return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
}

/** How much smaller the screen gets inside its card, 0–1. */
export function cardScale({
	canvas,
	source,
	padding,
}: {
	canvas: { width: number; height: number };
	source: { width: number; height: number };
	padding: number;
}): number {
	const full = Math.min(canvas.width / source.width, canvas.height / source.height);
	const card = cardRect({ canvas, source, padding });
	return card.width / (source.width * full);
}

/** Cursor at time t (seconds), raw or smoothed, plus whether it's idle. */
export function cursorAt({
	log,
	t,
	smooth,
	hideAfter,
}: {
	log: CursorLog;
	t: number;
	smooth: boolean;
	hideAfter: number;
}): { x: number; y: number; opacity: number } | null {
	const samples = log.samples;
	if (!samples.length || t < (samples[0]?.[0] ?? 0)) return null;
	let last = 0;
	for (let i = 0; i < samples.length && (samples[i]?.[0] ?? Infinity) <= t; i++) last = i;
	const sample = samples[last]!;
	const point = smooth ? (smoothedCursor({ log, t }) ?? { x: sample[1], y: sample[2] }) : { x: sample[1], y: sample[2] };
	// Clicks count as activity too.
	const lastClick = log.clicks.reduce((m, c) => (c[0] <= t ? Math.max(m, c[0]) : m), -Infinity);
	const idle = t - Math.max(sample[0], lastClick);
	const opacity =
		hideAfter > 0 && idle > hideAfter ? Math.max(0, 1 - (idle - hideAfter) / 0.4) : 1;
	return { ...point, opacity };
}

/** Clicks still rippling at time t: progress 0–1 of a 0.5 s ripple. */
export function ripplesAt({
	log,
	t,
	duration = 0.5,
}: {
	log: CursorLog;
	t: number;
	duration?: number;
}): { x: number; y: number; progress: number }[] {
	return log.clicks
		.filter(([ct]) => ct <= t && t - ct < duration)
		.map(([ct, x, y]) => ({ x, y, progress: (t - ct) / duration }));
}

/** The shortcut to show at time t (shown for 1.2 s after it's pressed). */
export function keyAt({ log, t }: { log: CursorLog; t: number }): {
	label: string;
	opacity: number;
} | null {
	let found: [number, string] | null = null;
	for (const key of log.keys) if (key[0] <= t && t - key[0] < 1.2) found = key;
	if (!found) return null;
	const age = t - found[0];
	return { label: found[1], opacity: age > 0.9 ? Math.max(0, 1 - (age - 0.9) / 0.3) : 1 };
}
