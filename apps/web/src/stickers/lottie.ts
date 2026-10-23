import type { AnimationConfigWithData, AnimationItem } from "lottie-web";
import { driftAnimationUrl, type DriftAsset } from "./providers/drift";

/**
 * Which animation second to show `clipSeconds` into a clip `clipLength`
 * seconds long. Loops repeat, intro-hold stops on its last frame, and
 * intro-hold-outro holds between its intro and an outro that ends with the clip.
 */
export function lottieSecondsAt({
	asset,
	clipSeconds,
	clipLength,
}: {
	asset: Pick<DriftAsset, "fps" | "frames" | "playback" | "intro" | "outro">;
	clipSeconds: number;
	clipLength: number;
}): number {
	const length = asset.frames / asset.fps;
	const lastFrame = Math.max(0, (asset.frames - 1) / asset.fps);
	const t = Math.max(0, clipSeconds);

	if (asset.playback === "loop") return t % length;
	if (asset.playback === "intro-hold-outro" && asset.intro && asset.outro) {
		const [, introEnd] = asset.intro;
		const [outroStart, outroEnd] = asset.outro;
		const outroLength = outroEnd - outroStart;
		// Too short to hold: play straight through, so the outro still shows.
		if (clipLength <= introEnd + outroLength) return Math.min(t, lastFrame);
		const outroAt = clipLength - outroLength;
		if (t >= outroAt) return Math.min(outroStart + (t - outroAt), lastFrame);
		return Math.min(t, introEnd);
	}
	return Math.min(t, lastFrame);
}

interface LoadedAnimation {
	animation: AnimationItem;
	canvas: HTMLCanvasElement;
	/**
	 * Copies of rendered frames. The compositor caches textures by source
	 * object, so every frame needs a canvas of its own.
	 */
	frames: Map<number, OffscreenCanvas>;
}

const MAX_CACHED_FRAMES = 8;
const animations = new Map<string, Promise<LoadedAnimation>>();

function loadAnimation({
	asset,
}: {
	asset: DriftAsset;
}): Promise<LoadedAnimation> {
	const cached = animations.get(asset.id);
	if (cached) return cached;

	const promise = (async (): Promise<LoadedAnimation> => {
		const [{ default: lottie }, response] = await Promise.all([
			import("lottie-web/build/player/lottie_canvas"),
			fetch(driftAnimationUrl({ assetId: asset.id })),
		]);
		if (!response.ok) {
			throw new Error(`Failed to load animation: ${asset.id}`);
		}
		const animationData = await response.json();
		const canvas = document.createElement("canvas");
		canvas.width = asset.width;
		canvas.height = asset.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Failed to create 2D rendering context");
		// No container: lottie would size the frame to it, and this canvas is
		// never in the DOM. With only a context it uses the canvas's own size.
		const animation = lottie.loadAnimation({
			renderer: "canvas",
			loop: false,
			autoplay: false,
			animationData,
			rendererSettings: { context, clearCanvas: true },
		} as AnimationConfigWithData<"canvas">);
		return { animation, canvas, frames: new Map() };
	})();

	promise.catch(() => animations.delete(asset.id));
	animations.set(asset.id, promise);
	return promise;
}

/** Draws one frame of a Drift animation and returns it as a canvas. */
export async function renderLottieFrame({
	asset,
	seconds,
}: {
	asset: DriftAsset;
	seconds: number;
}): Promise<OffscreenCanvas> {
	const loaded = await loadAnimation({ asset });
	const frame = Math.min(
		Math.max(0, Math.round(seconds * asset.fps)),
		Math.max(0, asset.frames - 1),
	);
	const cached = loaded.frames.get(frame);
	if (cached) {
		loaded.frames.delete(frame);
		loaded.frames.set(frame, cached);
		return cached;
	}

	loaded.animation.goToAndStop(frame, true);
	const copy = new OffscreenCanvas(asset.width, asset.height);
	copy.getContext("2d")?.drawImage(loaded.canvas, 0, 0);
	loaded.frames.set(frame, copy);
	if (loaded.frames.size > MAX_CACHED_FRAMES) {
		const oldest = loaded.frames.keys().next().value;
		if (oldest !== undefined) loaded.frames.delete(oldest);
	}
	return copy;
}
