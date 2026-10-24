"use client";

import { strToU8, zipSync } from "fflate";
import { motionToLottie, type RasterizeText } from "./lottie-convert";
import type { Layer, MotionProject } from "./model";
import { layerSize } from "./model";
import { drawLayerContent, drawProject, prepareProject } from "./render";

export type MotionExportFormat = "lottie" | "dotlottie" | "gif" | "mp4" | "webm" | "png" | "svg";

export interface MotionExportOptions {
	format: MotionExportFormat;
	/** Output size relative to the canvas (0.25–2). */
	scale: number;
	fps: number;
	/** Seconds from the start; defaults to the whole animation. */
	duration: number;
	/** How many times the animation plays in a video (1 = once). */
	repeats: number;
	/** Keep the background see-through (GIF, WebM, PNG); otherwise black when there's no background. */
	transparent: boolean;
	quality: "low" | "medium" | "high";
	/** GIF: loop forever. */
	loop: boolean;
}

export const FORMAT_INFO: Record<MotionExportFormat, { label: string; ext: string; note: string }> = {
	lottie: { label: "Lottie JSON", ext: "json", note: "Vector, editable in Lottie tools. Text becomes a picture." },
	dotlottie: { label: "dotLottie (.lottie)", ext: "lottie", note: "Compressed Lottie with pictures inside." },
	gif: { label: "Animated GIF", ext: "gif", note: "256 colours; transparency is on/off per pixel." },
	mp4: { label: "MP4 (H.264)", ext: "mp4", note: "Plays everywhere. No transparency." },
	webm: { label: "WebM (VP9)", ext: "webm", note: "Keeps transparency where the player supports it." },
	png: { label: "PNG sequence (.zip)", ext: "zip", note: "One transparent PNG per frame." },
	svg: { label: "SVG (current frame)", ext: "svg", note: "A still vector picture of the frame at the playhead." },
};

function canvasOf({ width, height }: { width: number; height: number }) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

export const rasterizeText: RasterizeText = async (layer) => {
	const { w, h } = layerSize(layer);
	const scale = 2;
	const canvas = canvasOf({ width: Math.max(1, Math.ceil(w * scale)), height: Math.max(1, Math.ceil(h * scale)) });
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas");
	if (document.fonts) await document.fonts.load(`${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`).catch(() => []);
	ctx.scale(scale, scale);
	await drawLayerContent({ ctx, layer: layer as Layer });
	return { src: canvas.toDataURL("image/png"), w, h };
};

async function lottieJson(project: MotionProject) {
	return motionToLottie({ project, rasterizeText });
}

/** The project as a Lottie JSON object (for the video editor and exports). */
export const projectToLottie = lottieJson;

function svgMarkup({ project, t }: { project: MotionProject; t: number }): Promise<string> {
	return import("react-dom/server").then(async ({ renderToStaticMarkup }) => {
		const { createElement } = await import("react");
		const { StageThumbnail } = await import("./components/stage");
		return `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(createElement(StageThumbnail, { project, t })).replace(
			"<svg",
			`<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}"`,
		)}`;
	});
}

/** Renders and encodes the project. `onProgress` gets 0–1; `signal` cancels. */
export async function exportMotion({
	project,
	options,
	time,
	onProgress,
	signal,
}: {
	project: MotionProject;
	options: MotionExportOptions;
	/** Playhead, for the SVG still. */
	time: number;
	onProgress?: (p: number) => void;
	signal?: AbortSignal;
}): Promise<Blob> {
	const { format } = options;
	if (format === "lottie") return new Blob([JSON.stringify(await lottieJson(project))], { type: "application/json" });
	if (format === "dotlottie") {
		const id = project.id;
		const zip = zipSync({
			"manifest.json": strToU8(JSON.stringify({ version: "1", generator: "FrameFlow Motion Studio", animations: [{ id }] })),
			[`animations/${id}.json`]: strToU8(JSON.stringify(await lottieJson(project))),
		});
		return new Blob([zip.slice()], { type: "application/zip" });
	}
	if (format === "svg") return new Blob([await svgMarkup({ project, t: time })], { type: "image/svg+xml" });

	await prepareProject(project);
	const width = Math.max(2, Math.round((project.width * options.scale) / 2) * 2);
	const height = Math.max(2, Math.round((project.height * options.scale) / 2) * 2);
	const canvas = canvasOf({ width, height });
	const ctx = canvas.getContext("2d", { willReadFrequently: format === "gif" });
	if (!ctx) throw new Error("Couldn't create a canvas");
	const fps = Math.max(1, options.fps);
	const one = Math.max(1, Math.round(Math.min(options.duration, project.duration) * fps));
	const repeats = format === "mp4" || format === "webm" ? Math.max(1, Math.round(options.repeats)) : 1;
	const total = one * repeats;
	const opaque = format === "mp4" || !options.transparent;
	const frameAt = async (i: number) => {
		await drawProject({ ctx, project, t: (i % one) / fps, scale: width / project.width });
		if (opaque && !project.background) {
			ctx.save();
			ctx.globalCompositeOperation = "destination-over";
			ctx.fillStyle = "#000";
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
		}
	};
	const check = () => {
		if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
	};

	if (format === "png") {
		const files: Record<string, Uint8Array> = {};
		for (let i = 0; i < total; i++) {
			check();
			await frameAt(i);
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
			if (blob) files[`${project.name.replace(/[^\w-]+/g, "_") || "frame"}_${String(i).padStart(5, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
			onProgress?.((i + 1) / total);
		}
		return new Blob([zipSync(files, { level: 0 }).slice()], { type: "application/zip" });
	}

	if (format === "gif") {
		const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
		const gif = GIFEncoder();
		const delay = Math.round(1000 / fps);
		const alpha = !opaque;
		for (let i = 0; i < total; i++) {
			check();
			await frameAt(i);
			const { data } = ctx.getImageData(0, 0, width, height);
			const palette = alpha ? quantize(data, 256, { format: "rgba4444", oneBitAlpha: true }) : quantize(data, 256);
			const index = alpha ? applyPalette(data, palette, "rgba4444") : applyPalette(data, palette);
			const transparentIndex = alpha ? palette.findIndex((c) => (c[3] ?? 255) === 0) : -1;
			gif.writeFrame(index, width, height, {
				palette,
				delay,
				...(i === 0 ? { repeat: options.loop ? 0 : -1 } : {}),
				...(transparentIndex >= 0 ? { transparent: true, transparentIndex } : {}),
			});
			onProgress?.((i + 1) / total);
			if (i % 4 === 0) await new Promise((r) => setTimeout(r));
		}
		gif.finish();
		return new Blob([gif.bytes().slice()], { type: "image/gif" });
	}

	const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH } = await import("mediabunny");
	const bitrate = { low: QUALITY_LOW, medium: QUALITY_MEDIUM, high: QUALITY_HIGH }[options.quality];
	const output = new Output({ format: format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(), target: new BufferTarget() });
	const source = new CanvasSource(canvas, {
		codec: format === "webm" ? "vp9" : "avc",
		bitrate,
		...(format === "webm" && !opaque ? { alpha: "keep" as const } : {}),
	});
	output.addVideoTrack(source, { frameRate: fps });
	await output.start();
	for (let i = 0; i < total; i++) {
		check();
		await frameAt(i);
		await source.add(i / fps, 1 / fps);
		onProgress?.((i + 1) / total);
	}
	source.close();
	await output.finalize();
	const buffer = output.target.buffer;
	if (!buffer) throw new Error("The encoder produced no data");
	return new Blob([buffer], { type: format === "webm" ? "video/webm" : "video/mp4" });
}

export function downloadBlob({ blob, name }: { blob: Blob; name: string }) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
