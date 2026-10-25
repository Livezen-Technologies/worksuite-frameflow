import type { SceneTracks } from "@/timeline/types";
import type { TProjectSettings } from "@/project/types";

/**
 * The render cache (SRS PS-13) splits the timeline into short segments.
 * Each segment's fingerprint covers everything that can change its
 * picture: the clips that overlap it (with every setting), their track's
 * state and the project's picture settings. Any edit changes the
 * fingerprint, so a stale render is never shown.
 */

export const SEGMENT_SECONDS = 2;

export interface Segment {
	index: number;
	startFrame: number;
	/** Exclusive. */
	endFrame: number;
}

export function segmentFrames({ fps }: { fps: number }): number {
	return Math.max(1, Math.round(SEGMENT_SECONDS * fps));
}

export function segmentsFor({
	totalFrames,
	fps,
}: {
	totalFrames: number;
	fps: number;
}): Segment[] {
	const size = segmentFrames({ fps });
	const out: Segment[] = [];
	for (let start = 0, index = 0; start < totalFrames; start += size, index++)
		out.push({
			index,
			startFrame: start,
			endFrame: Math.min(totalFrames, start + size),
		});
	return out;
}

export function segmentAt({
	frame,
	fps,
}: {
	frame: number;
	fps: number;
}): number {
	return Math.floor(frame / segmentFrames({ fps }));
}

/** FNV-1a, 52 bits: plenty to tell renders apart, fast on long strings. */
export function hashString(text: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x1505;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193);
		h2 = Math.imul(h2 ^ c, 33) + c;
	}
	return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/** JSON without values that can't be compared (files, buffers, functions). */
function stable(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) => {
		if (typeof v === "function") return undefined;
		if (typeof Blob !== "undefined" && v instanceof Blob) return undefined;
		if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return undefined;
		return v;
	});
}

export function segmentFingerprint({
	tracks,
	settings,
	startTicks,
	endTicks,
	extra = "",
	ticksPerSecond = 120_000,
}: {
	tracks: SceneTracks;
	settings: Pick<TProjectSettings, "canvasSize" | "background" | "fps"> &
		Partial<TProjectSettings>;
	startTicks: number;
	endTicks: number;
	/** Anything else that changes the picture (cache size, renderer version). */
	extra?: string;
	ticksPerSecond?: number;
}): string {
	const ordered = [...tracks.overlay, tracks.main, ...tracks.audio];
	const parts = ordered.map((track) => {
		const { elements, ...trackState } = track;
		// Transitions and animations reach a little past a clip's edges; a
		// one-frame margin keeps neighbours honest.
		// A transition into a clip starts before the clip does, so count it
		// from where its window can begin.
		const hits = elements.filter((e) => {
			const lead =
				"transitionIn" in e && e.transitionIn
					? e.transitionIn.duration * ticksPerSecond
					: 0;
			return e.startTime - lead < endTicks && e.startTime + e.duration > startTicks;
		});
		return hits.length ? stable({ trackState, hits }) : "";
	});
	return hashString(
		stable({
			canvas: settings.canvasSize,
			background: settings.background,
			fps: settings.fps,
			colorSpace: settings.colorSpace,
			hdr: settings.hdr,
		}) +
			// Empty tracks don't draw here; leaving them out means adding a track
			// elsewhere doesn't invalidate this segment. Order of the rest is kept.
			parts.filter(Boolean).join("|") +
			extra,
	);
}
