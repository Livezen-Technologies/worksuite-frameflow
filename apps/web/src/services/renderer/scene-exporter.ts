import EventEmitter from "eventemitter3";

import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
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
	}

	/**
	 * The canvas the encoder reads. When the output size differs from the
	 * project, each frame is scaled onto a canvas of that size, letterboxed.
	 */
	private createEncodeSurface(): {
		canvas: HTMLCanvasElement;
		copyFrame: () => void;
	} {
		const source = this.renderer.getOutputCanvas();
		const { width, height } = this.outputSize;
		if (width === this.renderer.width && height === this.renderer.height) {
			return { canvas: source, copyFrame: () => {} };
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
		};
	}

	cancel(): void {
		this.isCancelled = true;
	}

	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.floor(rootNode.duration / ticksPerFrame);

		const outputFormat =
			this.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const surface = this.createEncodeSurface();
		const videoSource = new CanvasSource(surface.canvas, {
			codec: this.codec,
			bitrate: qualityMap[this.quality],
		});

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

		for (let i = 0; i < frameCount; i++) {
			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			const timeTicks = i * ticksPerFrame;
			const timeSeconds = mediaTimeToSeconds({ time: timeTicks });
			await this.renderer.render({ node: rootNode, time: timeTicks });
			surface.copyFrame();
			await videoSource.add(timeSeconds, 1 / fpsFloat);

			this.emit("progress", i / frameCount);
		}

		if (this.isCancelled) {
			await output.cancel();
			this.emit("cancelled");
			return null;
		}

		videoSource.close();
		await output.finalize();
		this.emit("progress", 1);

		const buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export video"));
			return null;
		}

		this.emit("complete", buffer);
		return buffer;
	}
}
