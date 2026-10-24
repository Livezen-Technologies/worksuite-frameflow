import type { AnimationConfigWithData, AnimationItem, LottiePlayer } from "lottie-web";
import { findPackAsset, MissingPackError, packAssetJsonUrl, type PackIndexAsset } from "./catalog";
import { normalizeColorMap, recolorLottie } from "./colors";
import {
	alignedX,
	fitFontSize,
	hideLayerPaint,
	imageDrawRect,
	layersToHide,
	layerToCanvasMatrix,
	liveImageSlots,
	liveTextSlots,
	localBox,
	slotsKey,
	slotText,
	traceMask,
} from "./slots";
import { frameTime, renderAnimatedText } from "@/text-animation/render";
import type { LottieJson, LottieSlotOverrides, LottieSource } from "./types";
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
	if (source.kind === "user") return `user:${source.id}`;
	const id = source.pack ? `${source.pack.id}@${source.pack.version}/${source.assetId}` : source.assetId;
	return source.variant ? `pack:${id}#${source.variant}` : `pack:${id}`;
}

export function lottieSourceFromKey(key: string): LottieSource {
	const [kind, ...rest] = key.split(":");
	const id = rest.join(":");
	if (kind !== "pack") return { kind: "user", id };
	// pack:<asset>[#variant], pack:<pack>@<version>/<asset>[#variant]; older keys used @variant.
	const [ref, hashVariant] = id.split("#");
	const slash = ref.indexOf("/");
	if (slash > 0) {
		const [packId, version] = ref.slice(0, slash).split("@");
		const assetId = ref.slice(slash + 1);
		return { kind: "pack", assetId, ...(hashVariant ? { variant: hashVariant } : {}), pack: { id: packId, version } };
	}
	const [assetId, oldVariant] = ref.split("@");
	const variant = hashVariant ?? oldVariant;
	return variant ? { kind: "pack", assetId, variant } : { kind: "pack", assetId };
}

const jsonCache = new Map<string, Promise<LottieJson>>();

/** The animation as authored, parsed once and shared. Don't mutate it. */
export function loadLottieJson(source: LottieSource): Promise<LottieJson> {
	const key = lottieSourceKey(source);
	let promise = jsonCache.get(key);
	if (!promise) {
		promise = (async () => {
			if (source.kind === "pack") {
				const asset = await findPackAsset(source.assetId, source.pack);
				if (!asset) throw new Error(`Animation "${source.assetId}" isn't in the library`);
				const response = await fetch(packAssetJsonUrl(asset, source.variant));
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

/** Forget one imported animation (after Motion Studio updates it). */
export function forgetUserAnimation(id: string) {
	const prefix = `user:${id}`;
	jsonCache.delete(prefix);
	for (const key of [...instances.keys()])
		if (key === prefix || key.startsWith(`${prefix}|`)) {
			ready.get(key)?.animation.destroy();
			ready.delete(key);
			instances.delete(key);
		}
}

/** Forget cached animations of a pack (after it installs or updates). */
export function forgetPackAnimations(packId?: string) {
	for (const key of [...jsonCache.keys()]) if (!packId || key.startsWith(`pack:${packId}@`)) jsonCache.delete(key);
	for (const key of [...instances.keys()]) if (!packId || key.startsWith(`pack:${packId}@`)) {
		ready.get(key)?.animation.destroy();
		ready.delete(key);
		instances.delete(key);
	}
}

interface Instance {
	key: string;
	animation: AnimationItem;
	asset: PackIndexAsset | null;
	canvas: HTMLCanvasElement;
	frame: number;
	lastUsed: number;
}

/** An imported animation's text slots and colours, shaped like a pack asset for slot drawing. */
export async function userAsset(id: string): Promise<PackIndexAsset | null> {
	const entry = await getUserLottie(id);
	if (!entry?.textSlots?.length) return null;
	return {
		id,
		name: entry.name,
		category: "user",
		path: "",
		tags: [],
		durationSec: (entry.json.op - entry.json.ip) / entry.json.fr,
		loop: false,
		width: entry.json.w,
		height: entry.json.h,
		colors: entry.colors,
		textSlots: entry.textSlots,
		files: {},
	};
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
	slots,
}: {
	source: LottieSource;
	colors: Record<string, string>;
	width: number;
	height: number;
	slots?: LottieSlotOverrides;
}): Promise<Instance> {
	const map = normalizeColorMap(colors);
	const key = `${lottieSourceKey(source)}|${JSON.stringify(map)}|${width}x${height}|${slotsKey({ text: slots?.text, hidden: slots?.hidden })}`;
	let promise = instances.get(key);
	if (!promise) {
		promise = (async () => {
			const [lottie, json, asset] = await Promise.all([
				loadLottieRuntime(),
				loadLottieJson(source),
				source.kind === "pack" ? findPackAsset(source.assetId, source.pack) : userAsset(source.id),
			]);
			const hide = layersToHide({ textSlots: asset?.textSlots ?? [], imageSlots: asset?.imageSlots ?? [], overrides: slots });
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
				animationData: recolorLottie(hideLayerPaint(json, hide), map),
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
			const instance = { key, animation, asset, canvas, frame: Number.NaN, lastUsed: performance.now() };
			ready.set(key, instance);
			evict();
			return instance;
		})();
		promise.catch(() => instances.delete(key));
		instances.set(key, promise);
	}
	return promise;
}

/** lottie-web's per-layer element (only the fields read here). */
interface LayerElement {
	data?: { nm?: string };
	isInRange?: boolean;
	finalTransform?: { mat: { props: ArrayLike<number> }; mProp?: { o?: { v: number } } };
}

function layerElement(animation: AnimationItem, name: string): LayerElement | null {
	const elements = (animation as unknown as { renderer?: { elements?: LayerElement[] } }).renderer?.elements ?? [];
	return elements.find((e) => e?.data?.nm === name) ?? null;
}

const imageCache = new Map<string, Promise<HTMLImageElement | ImageBitmap>>();
function loadImage(src: string): Promise<HTMLImageElement | ImageBitmap> {
	let promise = imageCache.get(src);
	if (!promise) {
		promise = fetch(src)
			.then((r) => r.blob())
			.then((blob) => createImageBitmap(blob));
		promise.catch(() => imageCache.delete(src));
		imageCache.set(src, promise);
		if (imageCache.size > 32) imageCache.delete(imageCache.keys().next().value as string);
	}
	return promise;
}

type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Live text and pictures over the frame, following their slot layers. */
async function drawSlots({
	context,
	instance,
	slots,
	colors,
	lang,
	width,
	height,
	frameIndex = 0,
}: {
	context: Context2D;
	instance: Instance;
	frameIndex?: number;
	slots?: LottieSlotOverrides;
	colors: Record<string, string>;
	lang?: string;
	width: number;
	height: number;
}) {
	const asset = instance.asset;
	if (!asset || !slots) return;
	const comp = { w: asset.width, h: asset.height };
	const hidden = new Set(slots.hidden ?? []);
	for (const slot of liveImageSlots(asset.imageSlots ?? [], slots)) {
		const element = layerElement(instance.animation, slot.layer);
		if (!element?.finalTransform || element.isInRange === false || hidden.has(slot.layer)) continue;
		const override = slots.image?.[slot.id];
		if (!override) continue;
		let image: HTMLImageElement | ImageBitmap;
		try {
			image = await loadImage(override.src);
		} catch {
			continue;
		}
		const opacity = element.finalTransform.mProp?.o?.v ?? 1;
		context.save();
		context.setTransform(...layerToCanvasMatrix({ props: element.finalTransform.mat.props, comp, canvas: { width, height } }));
		context.globalAlpha = opacity;
		traceMask(context as unknown as CanvasRenderingContext2D, slot.mask);
		context.clip();
		const rect = imageDrawRect({ image, mask: slot.mask, override });
		context.drawImage(image, rect.x, rect.y, rect.w, rect.h);
		context.restore();
	}
	const live = liveTextSlots(asset.textSlots ?? [], slots);
	for (const slot of live) {
		const element = layerElement(instance.animation, slot.layer);
		if (!element?.finalTransform || element.isInRange === false || hidden.has(slot.layer)) continue;
		const override = slots.text?.[slot.id] ?? {};
		const text = slotText({ slot, override, lang });
		if (!text) continue;
		const family = override.fontFamily ?? slot.fontFamily;
		const weight = override.fontWeight ?? slot.fontWeight;
		const familyCss = family
			.split(",")
			.map((f) => `"${f.trim().replace(/"/g, "")}"`)
			.join(", ");
		const font = (size: number) => `${weight} ${size}px ${familyCss}, sans-serif`;
		// Sinhala and Tamil need their (bundled) fonts loaded before drawing.
		if (typeof document !== "undefined" && document.fonts) {
			try {
				await document.fonts.load(font(slot.fontSize), text);
			} catch {
				// Draw with what's available.
			}
		}
		const spacingEm = override.letterSpacing ?? 0;
		const box = localBox(slot);
		context.save();
		context.setTransform(...layerToCanvasMatrix({ props: element.finalTransform.mat.props, comp, canvas: { width, height } }));
		context.globalAlpha = element.finalTransform.mProp?.o?.v ?? 1;
		const measure = (size: number) => {
			context.font = font(size);
			return context.measureText(text).width + spacingEm * size * Math.max(0, [...text].length - 1);
		};
		const size = fitFontSize({ measure, fontSize: slot.fontSize * (override.sizeScale ?? 1), box });
		const width2 = measure(size);
		context.font = font(size);
		if ("letterSpacing" in context) (context as { letterSpacing: string }).letterSpacing = `${spacingEm * size}px`;
		const colorSlot = asset.colors.find((c) => c.id === slot.color);
		const authored = colorSlot?.default.toUpperCase() ?? "#FFFFFF";
		context.fillStyle = override.color ?? colors[authored] ?? authored;
		if (override.textAnimation) {
			// Engine-animated words: same renderer as text clips, timed by the animation frame.
			const fps = instance.animation.frameRate || 30;
			renderAnimatedText({
				ctx: context,
				text,
				animation: override.textAnimation,
				time: frameTime(frameIndex, fps),
				duration: instance.animation.totalFrames / fps,
				x: alignedX(box, width2, slot.align) + width2 / 2,
				y: box.y + box.h / 2,
				style: {
					fontFamily: family,
					fontWeight: weight,
					fontSize: size,
					tracking: spacingEm,
					lineHeight: 1.15,
					align: slot.align,
					fill: String(context.fillStyle),
				},
			});
			context.restore();
			continue;
		}
		context.textBaseline = "middle";
		context.textAlign = "left";
		context.fillText(text, alignedX(box, width2, slot.align), box.y + box.h / 2);
		context.restore();
	}
}

/** A clip whose pack is still downloading (or can't download offline). */
function drawPlaceholder(context: Context2D, width: number, height: number, label: string) {
	context.clearRect(0, 0, width, height);
	context.save();
	context.fillStyle = "rgba(76, 141, 255, 0.18)";
	context.strokeStyle = "rgba(76, 141, 255, 0.9)";
	context.lineWidth = Math.max(2, width / 200);
	context.setLineDash([12, 8]);
	context.fillRect(0, 0, width, height);
	context.strokeRect(1, 1, width - 2, height - 2);
	context.fillStyle = "#FFFFFF";
	context.font = `600 ${Math.max(12, Math.round(height / 9))}px Inter, sans-serif`;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(label, width / 2, height / 2);
	context.restore();
}

/**
 * Draws `frame` of the animation (recoloured, with Motion Editor slots)
 * into `target`, scaled to fill it. Instances are cached per animation,
 * colours, hidden layers and size. A clip whose pack isn't installed
 * draws a placeholder until it is.
 */
export async function drawLottieFrame({
	source,
	colors,
	frame,
	target,
	slots,
}: {
	source: LottieSource;
	colors: Record<string, string>;
	frame: number;
	target: OffscreenCanvas | HTMLCanvasElement;
	slots?: LottieSlotOverrides;
}): Promise<void> {
	const context = target.getContext("2d") as Context2D | null;
	let instance: Instance;
	try {
		instance = await getInstance({ source, colors, width: target.width, height: target.height, slots });
	} catch (error) {
		if (error instanceof MissingPackError && context) {
			drawPlaceholder(context, target.width, target.height, "Downloading pack…");
			return;
		}
		throw error;
	}
	instance.lastUsed = performance.now();
	if (instance.frame !== frame) {
		instance.animation.goToAndStop(frame, true);
		instance.frame = frame;
	}
	if (!context) return;
	context.clearRect(0, 0, target.width, target.height);
	context.drawImage(instance.canvas, 0, 0);
	await drawSlots({
		context,
		instance,
		slots,
		colors: normalizeColorMap(colors),
		lang: source.kind === "pack" ? source.variant : undefined,
		width: target.width,
		height: target.height,
		frameIndex: frame,
	});
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
