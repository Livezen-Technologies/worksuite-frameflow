import type { AnimationConfigWithData, AnimationItem, LottiePlayer } from "lottie-web";
import { findPackAsset, packAssetJsonUrl } from "./catalog";
import { normalizeColorMap, recolorLottie } from "./colors";
import type { LottieJson, LottieSource } from "./types";
import { getUserLottie } from "./user-library";

/*
 * lottie-web's canvas renderer, driven one frame at a time with
 * goToAndStop(frame, true). It is loaded on first use so it doesn't weigh
 * on app start. The editor composites on the main thread, so animations
 * are drawn there too, into a canvas that is copied out per frame.
 */

/**
 * lottie-web's typings require a `container`, but with a 2D context the
 * canvas renderer needs none, and given one it would size itself from that
 * element instead of from the canvas.
 */
export function canvasAnimationConfig(
	config: Omit<AnimationConfigWithData<"canvas">, "container">,
): AnimationConfigWithData<"canvas"> {
	return config as AnimationConfigWithData<"canvas">;
}

let runtimePromise: Promise<LottiePlayer> | null = null;

export function loadLottieRuntime(): Promise<LottiePlayer> {
	runtimePromise ??= import("lottie-web/build/player/lottie_canvas")
		.then((module) => (module.default ?? module) as LottiePlayer)
		.catch((error) => {
			runtimePromise = null;
			throw error;
		});
	return runtimePromise;
}

export function lottieSourceKey(source: LottieSource): string {
	return source.kind === "pack" ? `pack:${source.assetId}` : `user:${source.id}`;
}

export function lottieSourceFromKey(key: string): LottieSource {
	const [kind, ...rest] = key.split(":");
	const id = rest.join(":");
	return kind === "pack" ? { kind: "pack", assetId: id } : { kind: "user", id };
}

const jsonCache = new Map<string, Promise<LottieJson>>();

/** The animation as authored, parsed once and shared. Don't mutate it. */
export function loadLottieJson(source: LottieSource): Promise<LottieJson> {
	const key = lottieSourceKey(source);
	let promise = jsonCache.get(key);
	if (!promise) {
		promise = (async () => {
			if (source.kind === "pack") {
				const asset = await findPackAsset(source.assetId);
				if (!asset) throw new Error(`Animation "${source.assetId}" isn't in the library`);
				const response = await fetch(packAssetJsonUrl(asset));
				if (!response.ok) throw new Error(`Couldn't load animation "${source.assetId}"`);
				return (await response.json()) as LottieJson;
			}
			const entry = await getUserLottie(source.id);
			if (!entry) throw new Error("This imported animation isn't on this device");
			return entry.json;
		})();
		promise.catch(() => jsonCache.delete(key));
		jsonCache.set(key, promise);
	}
	return promise;
}

interface Instance {
	key: string;
	animation: AnimationItem;
	canvas: HTMLCanvasElement;
	frame: number;
	lastUsed: number;
}

const MAX_INSTANCES = 16;
const instances = new Map<string, Promise<Instance>>();
const ready = new Map<string, Instance>();

/** Frees the least recently drawn animations beyond the cache size. */
function evict() {
	if (ready.size <= MAX_INSTANCES) return;
	const oldest = [...ready.values()].sort((a, b) => a.lastUsed - b.lastUsed);
	for (const instance of oldest.slice(0, ready.size - MAX_INSTANCES)) {
		instance.animation.destroy();
		ready.delete(instance.key);
		instances.delete(instance.key);
	}
}

async function getInstance({
	source,
	colors,
	width,
	height,
}: {
	source: LottieSource;
	colors: Record<string, string>;
	width: number;
	height: number;
}): Promise<Instance> {
	const map = normalizeColorMap(colors);
	const key = `${lottieSourceKey(source)}|${JSON.stringify(map)}|${width}x${height}`;
	let promise = instances.get(key);
	if (!promise) {
		promise = (async () => {
			const [lottie, json] = await Promise.all([loadLottieRuntime(), loadLottieJson(source)]);
			const canvas = document.createElement("canvas");
			// Sized before loading and never resized: resize() resets the
			// context under lottie-web's cached styles, which then draw black.
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Canvas 2D isn't available");
			const animation = lottie.loadAnimation(canvasAnimationConfig({
				renderer: "canvas",
				loop: false,
				autoplay: false,
				// lottie-web mutates the data it is given, so it gets its own copy.
				animationData: recolorLottie(json, map),
				rendererSettings: {
					context,
					clearCanvas: true,
					preserveAspectRatio: "xMidYMid meet",
				},
			}));
			if (!animation.isLoaded) {
				await new Promise<void>((resolve, reject) => {
					animation.addEventListener("DOMLoaded", () => resolve());
					animation.addEventListener("data_failed", () => reject(new Error("Couldn't read the animation")));
				});
			}
			const instance = { key, animation, canvas, frame: Number.NaN, lastUsed: performance.now() };
			ready.set(key, instance);
			evict();
			return instance;
		})();
		promise.catch(() => instances.delete(key));
		instances.set(key, promise);
	}
	return promise;
}

/**
 * Draws `frame` of the animation (recoloured) into `target`, scaled to fill
 * it. Instances are cached per animation, colours and size.
 */
export async function drawLottieFrame({
	source,
	colors,
	frame,
	target,
}: {
	source: LottieSource;
	colors: Record<string, string>;
	frame: number;
	target: OffscreenCanvas | HTMLCanvasElement;
}): Promise<void> {
	const instance = await getInstance({ source, colors, width: target.width, height: target.height });
	instance.lastUsed = performance.now();
	if (instance.frame !== frame) {
		instance.animation.goToAndStop(frame, true);
		instance.frame = frame;
	}
	const context = target.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
	if (!context) return;
	context.clearRect(0, 0, target.width, target.height);
	context.drawImage(instance.canvas, 0, 0);
}

/** Frees every cached animation (e.g. when a project closes). */
export async function disposeLottieInstances(): Promise<void> {
	const pending = [...instances.values()];
	instances.clear();
	ready.clear();
	for (const promise of pending) {
		try {
			(await promise).animation.destroy();
		} catch {
			// Never loaded; nothing to free.
		}
	}
}
