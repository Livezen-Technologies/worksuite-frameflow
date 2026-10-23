import type { InputVideoTrack, VideoSample, WrappedCanvas } from "mediabunny";
import { VideoSampleSink } from "mediabunny";
import type { ToneMapSettings, Transfer } from "./tonemap";
import { isSupportedFormat, ToneMapper, type PlanarFrame } from "./tonemap-gl";

const POOL_SIZE = 4;

/**
 * Drop-in for mediabunny's CanvasSink for HDR tracks: decodes each frame,
 * reads its raw 10-bit planes and tone-maps them with our own operator,
 * instead of letting the browser squeeze HDR into an 8-bit canvas.
 * Frames in other formats (e.g. from a hardware decoder) are drawn by the
 * browser as before.
 */
export class HdrCanvasSink {
	private samples: VideoSampleSink;
	private mapper: ToneMapper | null = null;
	private pool: HTMLCanvasElement[] = [];
	private next = 0;
	private buffer = new Uint16Array(0);

	private options: {
		transfer: Transfer;
		settings: ToneMapSettings;
		fullRange: boolean;
	};

	constructor({
		track,
		...options
	}: {
		track: InputVideoTrack;
		transfer: Transfer;
		settings: ToneMapSettings;
		fullRange: boolean;
	}) {
		this.samples = new VideoSampleSink(track);
		this.options = options;
	}

	private canvasFor({ width, height }: { width: number; height: number }) {
		let canvas = this.pool[this.next];
		if (!canvas) {
			canvas = document.createElement("canvas");
			this.pool[this.next] = canvas;
		}
		this.next = (this.next + 1) % POOL_SIZE;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		return canvas;
	}

	private async draw(sample: VideoSample): Promise<WrappedCanvas> {
		const frame = sample.toVideoFrame();
		try {
			const width = frame.displayWidth;
			const height = frame.displayHeight;
			const canvas = this.canvasFor({ width, height });
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("No 2D canvas");
			if (isSupportedFormat(frame.format) && frame.format) {
				const bytes = frame.allocationSize();
				if (this.buffer.byteLength < bytes)
					this.buffer = new Uint16Array(Math.ceil(bytes / 2));
				const layout = await frame.copyTo(this.buffer);
				const planar: PlanarFrame = {
					format: frame.format,
					width: frame.visibleRect?.width ?? frame.codedWidth,
					height: frame.visibleRect?.height ?? frame.codedHeight,
					data: this.buffer,
					layout,
					fullRange: frame.colorSpace.fullRange ?? this.options.fullRange,
				};
				this.mapper ??= new ToneMapper();
				const mapped = this.mapper.render({
					frame: planar,
					transfer: this.options.transfer,
					settings: this.options.settings,
				});
				ctx.drawImage(mapped, 0, 0, width, height);
			} else {
				ctx.drawImage(frame, 0, 0, width, height);
			}
			return { canvas, timestamp: sample.timestamp, duration: sample.duration };
		} finally {
			frame.close();
			sample.close();
		}
	}

	async *canvases(
		startTimestamp?: number,
	): AsyncGenerator<WrappedCanvas, void, unknown> {
		for await (const sample of this.samples.samples(startTimestamp)) {
			yield await this.draw(sample);
		}
	}

	async getCanvas(timestamp: number): Promise<WrappedCanvas | null> {
		const sample = await this.samples.getSample(timestamp);
		return sample ? this.draw(sample) : null;
	}
}
