import type { MediaAsset } from "@/media/types";
import type { TCanvasSize } from "@/project/types";
import type { SceneTracks, TimelineElement } from "@/timeline";

/** What happens to clips when the frame changes shape or size (PS-11). */
export type ReflowMode = "fit" | "fill" | "keep";

export type ElementPatch = {
	trackId: string;
	elementId: string;
	patch: Partial<TimelineElement>;
};

function num({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Safe margin text centres are kept inside, as a fraction of the frame. */
const TEXT_MARGIN = 0.06;

/**
 * Titles and captions on a new shape (PS-11, SP-03): text size is relative
 * to the frame's height, so on a narrower frame it shrinks with the square
 * root of the aspect change (16:9 → 9:16 gives 0.56, as the packs use), and
 * its centre stays inside the safe margin. It never grows.
 */
export function reflowText({
	params,
	from,
	to,
	x,
	y,
	width,
}: {
	params: Record<string, unknown>;
	from: TCanvasSize;
	to: TCanvasSize;
	x: number;
	y: number;
	/** The text's drawn width on the new frame at its current size, if known. */
	width?: number;
}): Record<string, number> {
	const out: Record<string, number> = {};
	const change = to.width / to.height / (from.width / from.height);
	const fontSize = params.fontSize;
	if (typeof fontSize === "number" && Number.isFinite(fontSize)) {
		let factor = change < 1 ? Math.sqrt(change) : 1;
		// A long line must still fit across the safe width.
		const room = to.width * (1 - 2 * TEXT_MARGIN);
		if (width && width * factor > room) factor = room / width;
		if (factor < 1) out.fontSize = Math.floor(fontSize * factor * 10) / 10;
	}
	const limitX = to.width * (0.5 - TEXT_MARGIN);
	const limitY = to.height * (0.5 - TEXT_MARGIN);
	out["transform.positionX"] = Math.max(-limitX, Math.min(limitX, x));
	out["transform.positionY"] = Math.max(-limitY, Math.min(limitY, y));
	return out;
}

/**
 * Patches that keep the picture sensible on a new frame. Media is drawn
 * contained in the frame and offset in frame pixels, so:
 * - fit: offsets scale with the frame, each clip stays contained;
 * - fill: media clips scale to cover the new frame, centred;
 * - keep: every clip keeps its size and offset in pixels.
 */
export function reflowElements({
	tracks,
	assets,
	from,
	to,
	mode,
	measureText,
}: {
	tracks: SceneTracks;
	assets: MediaAsset[];
	from: TCanvasSize;
	to: TCanvasSize;
	mode: ReflowMode;
	/** Drawn width of a text clip on a frame of the given height (text needs a canvas). */
	measureText?: (args: { element: TimelineElement; canvasHeight: number }) => number;
}): ElementPatch[] {
	if (from.width === to.width && from.height === to.height) return [];
	const patches: ElementPatch[] = [];
	const sx = to.width / from.width;
	const sy = to.height / from.height;
	for (const track of [tracks.main, ...tracks.overlay]) {
		for (const element of track.elements) {
			const params = element.params ?? {};
			if (!("transform.positionX" in params) && !("transform.scaleX" in params))
				continue;
			const px = num({ value: params["transform.positionX"], fallback: 0 });
			const py = num({ value: params["transform.positionY"], fallback: 0 });
			const scaleX = num({ value: params["transform.scaleX"], fallback: 1 });
			const scaleY = num({ value: params["transform.scaleY"], fallback: 1 });
			const asset =
				"mediaId" in element
					? assets.find((a) => a.id === element.mediaId)
					: undefined;
			const next: Record<string, number> = {};
			if (mode === "fill" && asset?.width && asset.height) {
				const contain = Math.min(
					to.width / asset.width,
					to.height / asset.height,
				);
				const cover = Math.max(
					to.width / asset.width,
					to.height / asset.height,
				);
				const fill = cover / contain;
				next["transform.scaleX"] = fill * (Math.sign(scaleX) || 1);
				next["transform.scaleY"] = fill * (Math.sign(scaleY) || 1);
				next["transform.positionX"] = 0;
				next["transform.positionY"] = 0;
			} else if (mode === "keep" && asset?.width && asset.height) {
				const before = Math.min(
					from.width / asset.width,
					from.height / asset.height,
				);
				const after = Math.min(
					to.width / asset.width,
					to.height / asset.height,
				);
				next["transform.scaleX"] = (scaleX * before) / after;
				next["transform.scaleY"] = (scaleY * before) / after;
			} else if (mode !== "keep") {
				next["transform.positionX"] = px * sx;
				next["transform.positionY"] = py * sy;
				if (element.type === "text") {
					const width = measureText?.({ element, canvasHeight: to.height });
					Object.assign(
						next,
						reflowText({ params, from, to, x: px * sx, y: py * sy, width: width ? width * Math.abs(scaleX) : undefined }),
					);
				}
			}
			if (Object.keys(next).length === 0) continue;
			patches.push({
				trackId: track.id,
				elementId: element.id,
				patch: { params: { ...params, ...next } },
			});
		}
	}
	return patches;
}
