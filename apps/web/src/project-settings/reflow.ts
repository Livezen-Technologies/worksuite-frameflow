import type { MediaAsset } from "@/media/types";
import type { TCanvasSize } from "@/project/types";
import type { SceneTracks, TimelineElement } from "@/timeline";

/** What happens to clips when the frame changes shape or size (PS-11). */
export type ReflowMode = "fit" | "fill" | "keep";

type ElementPatch = {
	trackId: string;
	elementId: string;
	patch: Partial<TimelineElement>;
};

function num({ value, fallback }: { value: unknown; fallback: number }): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
}: {
	tracks: SceneTracks;
	assets: MediaAsset[];
	from: TCanvasSize;
	to: TCanvasSize;
	mode: ReflowMode;
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
				"mediaId" in element ? assets.find((a) => a.id === element.mediaId) : undefined;
			const next: Record<string, number> = {};
			if (mode === "fill" && asset?.width && asset.height) {
				const contain = Math.min(to.width / asset.width, to.height / asset.height);
				const cover = Math.max(to.width / asset.width, to.height / asset.height);
				const fill = cover / contain;
				next["transform.scaleX"] = fill * (Math.sign(scaleX) || 1);
				next["transform.scaleY"] = fill * (Math.sign(scaleY) || 1);
				next["transform.positionX"] = 0;
				next["transform.positionY"] = 0;
			} else if (mode === "keep" && asset?.width && asset.height) {
				const before = Math.min(from.width / asset.width, from.height / asset.height);
				const after = Math.min(to.width / asset.width, to.height / asset.height);
				next["transform.scaleX"] = (scaleX * before) / after;
				next["transform.scaleY"] = (scaleY * before) / after;
			} else if (mode !== "keep") {
				next["transform.positionX"] = px * sx;
				next["transform.positionY"] = py * sy;
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
