"use client";

import { animatedFrameAt, loadAnimatedImage } from "@/media/animated-image";
import { layerSize, pathD, valueAt, type Layer, type MotionProject } from "./model";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
	let hit = images.get(src);
	if (!hit) {
		hit = new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => resolve(null);
			img.src = src;
		});
		images.set(src, hit);
	}
	return hit;
}

/** Loads the project's pictures and fonts so frames draw without waiting. */
export async function prepareProject(project: MotionProject): Promise<void> {
	await Promise.all(project.layers.flatMap((l) => (l.kind === "image" ? [loadImage(l.src)] : [])));
	if (typeof document !== "undefined" && document.fonts)
		await Promise.all(
			project.layers.flatMap((l) =>
				l.kind === "text" ? [document.fonts.load(`${l.fontWeight} ${l.fontSize}px "${l.fontFamily}"`).catch(() => [])] : [],
			),
		);
}

async function drawShape({ ctx, layer, t = 0 }: { ctx: Ctx; layer: Layer; t?: number }) {
	switch (layer.kind) {
		case "rect":
		case "ellipse":
		case "path": {
			let path: Path2D;
			if (layer.kind === "rect") {
				path = new Path2D();
				path.roundRect(0, 0, layer.w, layer.h, Math.min(layer.radius, layer.w / 2, layer.h / 2));
			} else if (layer.kind === "ellipse") {
				path = new Path2D();
				path.ellipse(layer.w / 2, layer.h / 2, layer.w / 2, layer.h / 2, 0, 0, Math.PI * 2);
			} else path = new Path2D(pathD(layer));
			const closed = layer.kind !== "path" || layer.closed;
			if (closed && layer.fill) {
				ctx.fillStyle = layer.fill;
				ctx.fill(path);
			}
			const stroke = layer.stroke ?? (closed ? null : (layer.fill ?? "#fff"));
			const width = layer.stroke || !closed ? Math.max(1, layer.strokeWidth) : 0;
			if (stroke && width > 0) {
				ctx.strokeStyle = stroke;
				ctx.lineWidth = width;
				ctx.lineJoin = "round";
				ctx.lineCap = "round";
				ctx.stroke(path);
			}
			return;
		}
		case "text": {
			ctx.fillStyle = layer.fill;
			ctx.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}", sans-serif`;
			ctx.textBaseline = "top";
			layer.text.split("\n").forEach((line, i) => ctx.fillText(line, 0, i * layer.fontSize * 1.2));
			return;
		}
		case "image": {
			// Animated GIF/WebP: the frame for this moment, looping.
			if (/^data:image\/(gif|webp)/.test(layer.src)) {
				const animated = await loadAnimatedImage({ url: layer.src });
				if (animated) {
					ctx.drawImage(animatedFrameAt({ image: animated, seconds: t }), 0, 0, layer.w, layer.h);
					return;
				}
			}
			const img = await loadImage(layer.src);
			if (img) ctx.drawImage(img, 0, 0, layer.w, layer.h);
		}
	}
}

/** Draws one layer in its own coordinates (no transform), e.g. to turn text into a picture. */
export async function drawLayerContent({ ctx, layer }: { ctx: Ctx; layer: Layer }) {
	await drawShape({ ctx, layer });
}

/** Draws the project at time `t`, scaled by `scale`, onto `ctx`. Transparent unless it has a background. */
export async function drawProject({ ctx, project, t, scale = 1 }: { ctx: Ctx; project: MotionProject; t: number; scale?: number }) {
	ctx.save();
	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	ctx.clearRect(0, 0, project.width, project.height);
	if (project.background) {
		ctx.fillStyle = project.background;
		ctx.fillRect(0, 0, project.width, project.height);
	}
	for (const layer of project.layers) {
		if (!layer.visible) continue;
		const opacity = valueAt({ layer, prop: "opacity", t });
		if (opacity <= 0) continue;
		const { w, h } = layerSize(layer);
		ctx.save();
		ctx.globalAlpha = Math.min(1, opacity);
		ctx.translate(valueAt({ layer, prop: "x", t }), valueAt({ layer, prop: "y", t }));
		ctx.rotate((valueAt({ layer, prop: "rotation", t }) * Math.PI) / 180);
		const s = valueAt({ layer, prop: "scale", t });
		ctx.scale(s, s);
		ctx.translate(-layer.anchorX * w, -layer.anchorY * h);
		await drawShape({ ctx, layer, t });
		ctx.restore();
	}
	ctx.restore();
}
