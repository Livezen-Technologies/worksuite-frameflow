import EventEmitter from "eventemitter3";

import { LightLevelMeter } from "@/hdr/light-level";
import { injectHdrMetadata } from "@/hdr/webm-hdr-metadata";
import { setDeepDecode } from "@/hdr/sink";
import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	VideoSampleSource,
	VideoSample,
	AudioBufferSource,
	TextSubtitleSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
} from "mediabunny";
import type { FrameRate } from "opencut-wasm";
import { mediaTimeToSeconds } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { RootNode } from "./nodes/root-node";
import type { ExportCodec, ExportFormat, ExportQuality } from "@/export";
import { evenSize, fitRect } from "@/export/presets";
import { CanvasRenderer } from "./canvas-renderer";
import { HDR_CODEC_STRINGS, hdrVideoFrame, rgbaToI420P10 } from "@/hdr/encode";
import { DEFAULT_GIF_OPTIONS, ditherToPalette, gifRepeat, type GifOptions } from "@/export/gif";
import { audioBufferToWav, type MasterCodec, type MasterExportBridge } from "@/export/master";
import type { Interpolator } from "@/ai-export/interpolate";
import type { RgbaFrame, Upscaler } from "@/ai-export/upscale";

type ExportParams = {
	width: number;
	height: number;
	fps: FrameRate;
	format: ExportFormat;
	quality: ExportQuality;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
	codec?: ExportCodec;
	/** Output size when it differs from the project frame. */
	outputSize?: { width: number; height: number };
	/** WebVTT text to embed as a subtitle track. */
	subtitlesVtt?: string;
	videoBitrate?: number;
	coverImage?: string;
	/** HDR project export: 10-bit VP9 with HLG or PQ signalling (HD-14). */
	hdrOutput?: "hlg" | "pq";
	/** GIF tab options (EX-25). */
	gif?: GifOptions;
	/** Production export through FFmpeg on the desktop (EX-15). */
	master?: { bridge: MasterExportBridge; codec: MasterCodec };
	/**
	 * On-device AI after the full composite (EX-20, EX-21, EX-28): titles
	 * and captions are part of the picture by then and only get scaled.
	 */
	ai?: { upscaler?: Upscaler; interpolator?: Interpolator };
	/** Encoder preference (Export › Encoder). */
	hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
};

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
};

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private format: ExportFormat;
	private quality: ExportQuality;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;
	private codec: ExportCodec;
	private outputSize: { width: number; height: number };
	private subtitlesVtt?: string;
	private videoBitrate?: number;
	private coverImage?: string;
	private hdrOutput?: "hlg" | "pq";
	private gif: GifOptions;
	private master?: { bridge: MasterExportBridge; codec: MasterCodec };
	private ai: { upscaler?: Upscaler; interpolator?: Interpolator };
	private hardwareAcceleration: "no-preference" | "prefer-hardware" | "prefer-software";
	/** Set after a production export: the desktop job to save. */
	masterJobId: string | null = null;

	private isCancelled = false;

	constructor({
		width,
		height,
		fps,
		format,
		quality,
		shouldIncludeAudio,
		audioBuffer,
		codec,
		outputSize,
		subtitlesVtt,
		videoBitrate,
		coverImage,
		hdrOutput,
		gif,
		master,
		ai,
		hardwareAcceleration = "no-preference",
	}: ExportParams) {
		super();
		this.renderer = new CanvasRenderer({
			width,
			height,
			fps,
		});

		this.format = format;
		this.quality = quality;
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
		this.codec = codec ?? (format === "webm" ? "vp9" : "avc");
		this.outputSize = evenSize(outputSize ?? { width, height });
		this.subtitlesVtt = subtitlesVtt;
		this.videoBitrate = videoBitrate;
		this.coverImage = coverImage;
		this.hdrOutput = hdrOutput;
		this.gif = gif ?? DEFAULT_GIF_OPTIONS;
		this.master = master;
		this.ai = ai ?? {};
		this.hardwareAcceleration = hardwareAcceleration;
		if (hdrOutput) this.renderer.purpose = "export";
		// Exports always read the original media.
		this.renderer.useProxies = false;
	}

	/**
	 * The canvas the encoder reads. When the output size differs from the
	 * project, each frame is scaled onto a canvas of that size, letterboxed.
	 */
	private createEncodeSurface({
		separate = false,
	}: { separate?: boolean } = {}): {
		canvas: HTMLCanvasElement;
		copyFrame: () => void;
		drawPicture: (picture: ImageBitmap | HTMLCanvasElement) => void;
	} {
		const source = this.renderer.getOutputCanvas();
		const { width, height } = this.outputSize;
		if (
			!separate &&
			width === this.renderer.width &&
			height === this.renderer.height
		) {
			return { canvas: source, copyFrame: () => {}, drawPicture: () => {} };
		}
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Could not create the export canvas");
		ctx.imageSmoothingQuality = "high";
		const rect = fitRect({
			source: { width: this.renderer.width, height: this.renderer.height },
			target: { width, height },
		});
		return {
			canvas,
			copyFrame: () => {
				ctx.fillStyle = "#000000";
				ctx.fillRect(0, 0, width, height);
				ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
			},
			drawPicture: (picture) => {
				const fit = fitRect({
					source: { width: picture.width, height: picture.height },
					target: { width, height },
				});
				ctx.fillStyle = "#000000";
				ctx.fillRect(0, 0, width, height);
				ctx.drawImage(picture, fit.x, fit.y, fit.width, fit.height);
			},
		};
	}

	cancel(): void {
		this.isCancelled = true;
	}

	private get usesAi(): boolean {
		return !!(this.ai.upscaler || this.ai.interpolator);
	}

	/** Reads the rendered frame's pixels (the renderer canvas may be WebGL). */
	private readRendered(): RgbaFrame {
		const { width, height } = this.renderer;
		this.scratch ??= document.createElement("canvas");
		this.scratch.width = width;
		this.scratch.height = height;
		const ctx = this.scratch.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("Could not read the frame");
		ctx.drawImage(this.renderer.getOutputCanvas(), 0, 0);
		return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
	}
	private scratch: HTMLCanvasElement | null = null;
	private picture: HTMLCanvasElement | null = null;

	/** Renders frame `index` of the source timing and upscales it if asked. */
	private async renderSource({
		rootNode,
		time,
	}: {
		rootNode: RootNode;
		time: number;
	}): Promise<RgbaFrame> {
		await this.renderer.render({ node: rootNode, time });
		const frame = this.readRendered();
		return this.ai.upscaler ? this.ai.upscaler.upscale(frame) : frame;
	}

	private pendingNext: { index: number; frame: RgbaFrame } | null = null;
	private previous: { index: number; frame: RgbaFrame } | null = null;

	/**
	 * Output frame `i` through the AI stages. With optical flow the timeline
	 * is rendered on even frames and odd ones are made between neighbours.
	 */
	private async produceAiFrame({
		rootNode,
		i,
		ticksPerFrame,
		frameCount,
	}: {
		rootNode: RootNode;
		i: number;
		ticksPerFrame: number;
		frameCount: number;
	}): Promise<RgbaFrame> {
		const interpolator = this.ai.interpolator;
		const source = async (index: number) => {
			if (this.pendingNext?.index === index) return this.pendingNext.frame;
			return this.renderSource({ rootNode, time: index * ticksPerFrame });
		};
		let frame: RgbaFrame;
		if (!interpolator || i % 2 === 0) {
			frame = await source(i);
			this.previous = { index: i, frame };
		} else {
			const nextIndex = Math.min(i + 1, frameCount - 1);
			const next = await source(nextIndex);
			this.pendingNext = { index: nextIndex, frame: next };
			frame =
				this.previous && nextIndex !== i
					? await interpolator.middle({ a: this.previous.frame, b: next })
					: next;
		}
		return frame;
	}

	/** Draws an AI frame onto the encode surface, scaled to the output. */
	private drawAiFrame({
		frame,
		surface,
	}: {
		frame: RgbaFrame;
		surface: { drawPicture: (picture: HTMLCanvasElement) => void };
	}) {
		this.picture ??= document.createElement("canvas");
		this.picture.width = frame.width;
		this.picture.height = frame.height;
		const ctx = this.picture.getContext("2d");
		if (!ctx) throw new Error("Could not draw the frame");
		ctx.putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
		surface.drawPicture(this.picture);
	}

	/** Puts output frame `i` on the encode surface (cover, AI or plain). */
	private async drawFrame({
		rootNode,
		i,
		firstFrame,
		ticksPerFrame,
		frameCount,
		cover,
		surface,
	}: {
		rootNode: RootNode;
		i: number;
		firstFrame: number;
		ticksPerFrame: number;
		frameCount: number;
		cover: ImageBitmap | null;
		surface: {
			copyFrame: () => void;
			drawPicture: (picture: ImageBitmap | HTMLCanvasElement) => void;
		};
	}) {
		if (i === firstFrame && cover) {
			surface.drawPicture(cover);
			return;
		}
		if (this.usesAi) {
			const frame = await this.produceAiFrame({ rootNode, i, ticksPerFrame, frameCount });
			this.drawAiFrame({ frame, surface });
			return;
		}
		await this.renderer.render({ node: rootNode, time: i * ticksPerFrame });
		surface.copyFrame();
	}

	/** ProRes / FFV1 through the desktop FFmpeg (EX-15). */
	private async exportMaster({
		rootNode,
		frameCount,
		ticksPerFrame,
		fpsFloat,
		cover,
	}: {
		rootNode: RootNode;
		frameCount: number;
		ticksPerFrame: number;
		fpsFloat: number;
		cover: ImageBitmap | null;
	}): Promise<ArrayBuffer | null> {
		const master = this.master;
		if (!master) return null;
		const surface = this.createEncodeSurface({ separate: true });
		const ctx = surface.canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("Could not create the export canvas");
		const { width, height } = this.outputSize;
		// All master codecs are 10-bit: read frames straight from the float
		// working texture when nothing else has to be drawn over them.
		const deep =
			!cover && !this.usesAi && this.renderer.width === width && this.renderer.height === height;
		const job = await master.bridge.start({
			width,
			height,
			fps: fpsFloat,
			codec: master.codec,
			depth: deep ? 16 : 8,
			...(this.hdrOutput ? { hdr: this.hdrOutput } : {}),
			...(this.shouldIncludeAudio && this.audioBuffer
				? { audioWav: audioBufferToWav(this.audioBuffer) }
				: {}),
		});
		// 10-bit HDR footage keeps its precision into the engine (HD-14).
		setDeepDecode(deep);
		try {
			for (let i = 0; i < frameCount; i++) {
				if (this.isCancelled) {
					await master.bridge.cancel({ id: job.id });
					this.emit("cancelled");
					return null;
				}
				if (deep) {
					const pixels = await this.renderer.renderRgba16({
						node: rootNode,
						time: i * ticksPerFrame,
					});
					await master.bridge.frame({ id: job.id, data: pixels.buffer });
				} else {
					await this.drawFrame({
						rootNode,
						i,
						firstFrame: 0,
						ticksPerFrame,
						frameCount,
						cover,
						surface,
					});
					const pixels = ctx.getImageData(0, 0, width, height).data;
					await master.bridge.frame({ id: job.id, data: pixels.buffer });
				}
				this.emit("progress", (i + 1) / frameCount);
			}
			await master.bridge.finish({ id: job.id });
		} catch (error) {
			await master.bridge.cancel({ id: job.id }).catch(() => {});
			throw error;
		} finally {
			setDeepDecode(false);
		}
		this.masterJobId = job.id;
		const marker = new ArrayBuffer(0);
		this.emit("complete", marker);
		return marker;
	}

	async export({
		rootNode,
		range,
	}: {
		rootNode: RootNode;
		/** Only these frames [start, end), timed from zero (render cache). */
		range?: { startFrame: number; endFrame: number };
	}): Promise<ArrayBuffer | null> {
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.floor(rootNode.duration / ticksPerFrame);
		const cover = this.coverImage
			? await createImageBitmap(await (await fetch(this.coverImage)).blob())
			: null;
		if (this.master)
			return this.exportMaster({
				rootNode,
				frameCount,
				ticksPerFrame,
				fpsFloat,
				cover,
			});
		if (this.format === "gif")
			return this.exportGif({
				rootNode,
				frameCount,
				ticksPerFrame,
				fpsFloat,
				cover,
			});

		const outputFormat =
			this.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const hdr = this.hdrOutput;
		const surface = this.createEncodeSurface({
			separate: !!cover || !!hdr || this.usesAi,
		});
		const bitrate = this.videoBitrate ?? qualityMap[this.quality];
		const videoSource = hdr
			? new VideoSampleSource({
					codec: "vp9",
					bitrate,
					fullCodecString: HDR_CODEC_STRINGS[hdr],
				})
			: new CanvasSource(surface.canvas, { codec: this.codec, bitrate, hardwareAcceleration: this.hardwareAcceleration });
		const readback = hdr
			? surface.canvas.getContext("2d", { willReadFrequently: true })
			: null;

		output.addVideoTrack(videoSource, { frameRate: fpsFloat });

		let subtitleSource: TextSubtitleSource | null = null;
		if (
			this.subtitlesVtt &&
			outputFormat.getSupportedSubtitleCodecs().includes("webvtt")
		) {
			subtitleSource = new TextSubtitleSource("webvtt");
			output.addSubtitleTrack(subtitleSource);
		}

		let audioSource: AudioBufferSource | null = null;
		if (this.shouldIncludeAudio && this.audioBuffer) {
			let audioCodec: "aac" | "opus" = this.format === "webm" ? "opus" : "aac";

			if (audioCodec === "aac" && typeof AudioEncoder !== "undefined") {
				const { supported } = await AudioEncoder.isConfigSupported({
					codec: "mp4a.40.2",
					sampleRate: this.audioBuffer.sampleRate,
					numberOfChannels: this.audioBuffer.numberOfChannels,
					bitrate: 192000,
				});
				if (!supported) audioCodec = "opus";
			}

			audioSource = new AudioBufferSource({
				codec: audioCodec,
				bitrate: qualityMap[this.quality],
			});
			output.addAudioTrack(audioSource);
		}

		await output.start();

		if (audioSource && this.audioBuffer) {
			await audioSource.add(this.audioBuffer);
			audioSource.close();
		}

		if (subtitleSource && this.subtitlesVtt) {
			await subtitleSource.add(this.subtitlesVtt);
			subtitleSource.close();
		}

		// MaxCLL / MaxFALL for HDR10 metadata, measured as frames are encoded (HD-14).
		const lightLevels = new LightLevelMeter();
		const firstFrame = Math.max(0, range?.startFrame ?? 0);
		const endFrame = Math.min(frameCount, range?.endFrame ?? frameCount);
		for (let i = firstFrame; i < endFrame; i++) {
			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			const timeTicks = i * ticksPerFrame;
			const timeSeconds = mediaTimeToSeconds({
				time: (i - firstFrame) * ticksPerFrame,
			});
			if (hdr) {
				if (i === firstFrame && cover) surface.drawPicture(cover);
				else {
					await this.renderer.render({ node: rootNode, time: timeTicks });
					surface.copyFrame();
				}
			} else
				await this.drawFrame({
					rootNode,
					i,
					firstFrame,
					ticksPerFrame,
					frameCount,
					cover,
					surface,
				});
			if (videoSource instanceof VideoSampleSource && readback && hdr) {
				const { width, height } = surface.canvas;
				const pixels = readback.getImageData(0, 0, width, height).data;
				lightLevels.add({ rgba: pixels });
				const frame = hdrVideoFrame({
					data: rgbaToI420P10({ rgba: pixels, width, height, transfer: hdr }),
					width,
					height,
					timestamp: Math.round(timeSeconds * 1e6),
					duration: Math.round(1e6 / fpsFloat),
					transfer: hdr,
				});
				const sample = new VideoSample(frame);
				await videoSource.add(sample);
				sample.close();
			} else if (videoSource instanceof CanvasSource) {
				await videoSource.add(timeSeconds, 1 / fpsFloat);
			}

			this.emit(
				"progress",
				(i - firstFrame) / Math.max(1, endFrame - firstFrame),
			);
		}

		if (this.isCancelled) {
			await output.cancel();
			this.emit("cancelled");
			return null;
		}

		videoSource.close();
		await output.finalize();
		this.emit("progress", 1);

		let buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export video"));
			return null;
		}
		if (hdr && this.format === "webm") {
			buffer = injectHdrMetadata({
				buffer,
				meta: { ...lightLevels.result(), maxLuminance: 1000, minLuminance: 0.0001 },
			}).buffer;
		}

		this.emit("complete", buffer);
		return buffer;
	}

	/** Animated GIF: each frame quantised to its own 256-colour palette. */
	private async exportGif({
		rootNode,
		frameCount,
		ticksPerFrame,
		fpsFloat,
		cover,
	}: {
		rootNode: RootNode;
		frameCount: number;
		ticksPerFrame: number;
		fpsFloat: number;
		cover: ImageBitmap | null;
	}): Promise<ArrayBuffer | null> {
		const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
		const surface = this.createEncodeSurface({ separate: true });
		const ctx = surface.canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("Could not create the GIF canvas");
		const { width, height } = this.outputSize;
		const gif = GIFEncoder();
		const delay = Math.round(1000 / fpsFloat);
		const options = this.gif;
		const colors = Math.min(256, Math.max(2, Math.round(options.colors)));
		const first = Math.min(
			Math.max(0, frameCount - 1),
			Math.max(0, Math.round((options.startSeconds ?? 0) * fpsFloat)),
		);
		const end = options.maxSeconds
			? Math.min(frameCount, first + Math.ceil(options.maxSeconds * fpsFloat))
			: frameCount;
		const total = end - first;
		const repeat = gifRepeat(options.loop);
		for (let i = first; i < end; i++) {
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}
			await this.drawFrame({
				rootNode,
				i,
				firstFrame: first,
				ticksPerFrame,
				frameCount: end,
				cover,
				surface,
			});
			const { data } = ctx.getImageData(0, 0, width, height);
			const palette = quantize(data, colors);
			const index = options.dither
				? ditherToPalette({ rgba: data, width, height, palette })
				: applyPalette(data, palette);
			gif.writeFrame(index, width, height, {
				palette,
				delay,
				...(i === first ? { repeat } : {}),
			});
			this.emit("progress", (i - first) / total);
		}
		gif.finish();
		const bytes = gif.bytes();
		const buffer = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(buffer).set(bytes);
		this.emit("progress", 1);
		this.emit("complete", buffer);
		return buffer;
	}
}
