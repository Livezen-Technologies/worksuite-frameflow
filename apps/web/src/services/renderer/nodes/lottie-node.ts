import { motionPacksEpoch } from "@/lottie/catalog";
import { drawLottieFrame } from "@/lottie/player";
import { slotsKey } from "@/lottie/slots";
import type { LottieElementData } from "@/lottie/types";
import { createCanvasSurface } from "../canvas-utils";
import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface LottieNodeParams extends VisualNodeParams {
	lottie: LottieElementData;
}

/** Render size steps, as a share of the animation's own size. */
const MIN_RESOLUTION = 0.25;
const MAX_RESOLUTION = 2;

/** The render scale for an animation shown at `shownRatio` of its own size. */
export function lottieResolutionFor(shownRatio: number): number {
	const stepped = Math.ceil(Math.max(0, shownRatio) * 4) / 4;
	return Math.min(MAX_RESOLUTION, Math.max(MIN_RESOLUTION, stepped));
}

/**
 * An animation (Lottie) graphic. Each frame is drawn by lottie-web into one
 * of two canvases in turn: the compositor caches textures by source object,
 * so a new frame needs a different canvas, and two are enough to alternate.
 */
export class LottieNode extends VisualNode<
	LottieNodeParams,
	ResolvedVisualSourceNodeState
> {
	private buffers: OffscreenCanvas[] = [];
	private next = 0;
	private lastKey: string | null = null;
	private lastBuffer: OffscreenCanvas | null = null;

	async renderFrame({
		frame,
		resolution,
	}: {
		frame: number;
		resolution: number;
	}): Promise<OffscreenCanvas> {
		const { lottie } = this.params;
		const width = Math.max(1, Math.round(lottie.width * resolution));
		const height = Math.max(1, Math.round(lottie.height * resolution));
		// Frames are drawn at 1/100 frame precision; closer than that looks the same.
		const quantized = Math.round(frame * 100) / 100;
		const key = `${quantized}|${width}x${height}|${slotsKey(lottie.slots)}|${JSON.stringify(lottie.colors)}|${motionPacksEpoch()}`;
		if (this.lastBuffer && this.lastKey === key) return this.lastBuffer;

		let buffer = this.buffers[this.next];
		if (!buffer || buffer.width !== width || buffer.height !== height) {
			buffer = createCanvasSurface({ width, height }).canvas;
			this.buffers[this.next] = buffer;
		}
		this.next = (this.next + 1) % 2;

		await drawLottieFrame({
			source: lottie.source,
			colors: lottie.colors,
			frame: quantized,
			target: buffer,
			slots: lottie.slots,
		});
		this.lastKey = key;
		this.lastBuffer = buffer;
		return buffer;
	}
}
