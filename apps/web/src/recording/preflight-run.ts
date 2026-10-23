"use client";

import {
	bytesPerMinute,
	evaluatePreflight,
	QUALITY_PROFILES,
	type CheckRow,
	type PreflightMeasurements,
} from "./preflight";
import { MediaAccessError, Recorder, type RecorderOptions } from "./recorder";

/** Frames a stream really delivers per second, counted for `seconds`. */
async function measureFps({ stream, seconds = 2 }: { stream: MediaStream; seconds?: number }): Promise<{ fps: number; height: number }> {
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.srcObject = stream;
	await video.play();
	let frames = 0;
	const started = performance.now();
	await new Promise<void>((resolve) => {
		const tick = () => {
			frames++;
			if (performance.now() - started >= seconds * 1000) resolve();
			else video.requestVideoFrameCallback(tick);
		};
		video.requestVideoFrameCallback(tick);
		// Sources that stop sending frames still finish.
		setTimeout(resolve, seconds * 1000 + 500);
	});
	const elapsed = (performance.now() - started) / 1000;
	const height = video.videoHeight;
	video.srcObject = null;
	return { fps: frames / Math.max(elapsed, 0.001), height };
}

/** Frames per second the video encoder manages at the recording size. */
async function measureEncoder({ width, height, fps }: { width: number; height: number; fps: number }): Promise<number | null> {
	if (typeof VideoEncoder === "undefined") return null;
	const config: VideoEncoderConfig = { codec: "vp8", width, height, bitrate: 8_000_000, framerate: fps };
	if (!(await VideoEncoder.isConfigSupported(config)).supported) return null;
	const total = 45;
	let done = 0;
	const encoder = new VideoEncoder({ output: () => done++, error: () => {} });
	encoder.configure(config);
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const started = performance.now();
	for (let i = 0; i < total; i++) {
		// Moving noise so the encoder can't coast on still frames.
		ctx.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
		ctx.fillRect(0, 0, width, height);
		for (let n = 0; n < 200; n++) {
			ctx.fillStyle = n % 2 ? "#fff" : "#000";
			ctx.fillRect(Math.random() * width, Math.random() * height, 40, 40);
		}
		const frame = new VideoFrame(canvas, { timestamp: (i * 1e6) / fps });
		encoder.encode(frame, { keyFrame: i % 30 === 0 });
		frame.close();
	}
	await encoder.flush();
	encoder.close();
	return done / ((performance.now() - started) / 1000);
}

/** Bytes per second written to the storage recordings are chunked into. */
async function measureDisk(): Promise<number | null> {
	try {
		const root = await navigator.storage.getDirectory();
		const handle = await root.getFileHandle("frameflow-preflight.tmp", { create: true });
		const writable = await handle.createWritable();
		const chunk = new Uint8Array(1024 * 1024);
		crypto.getRandomValues(chunk.subarray(0, 65536));
		const count = 48;
		const started = performance.now();
		for (let i = 0; i < count; i++) await writable.write(chunk);
		await writable.close();
		const seconds = (performance.now() - started) / 1000;
		await root.removeEntry("frameflow-preflight.tmp");
		return (count * chunk.length) / Math.max(seconds, 0.001);
	} catch {
		return null;
	}
}

/** Opens the take's devices, measures them, and lets them go again (PF-01). */
export async function runPreflight({
	options,
	onStep,
}: {
	options: RecorderOptions;
	onStep?: (step: string) => void;
}): Promise<CheckRow[]> {
	const quality = QUALITY_PROFILES[options.profile];
	const m: PreflightMeasurements = {
		failed: [],
		video: [],
		encoderFps: null,
		encoderNeedFps: quality.fps,
		diskBytesPerSecond: null,
		needBytesPerSecond:
			bytesPerMinute({ mode: options.mode, profile: options.profile, channelCount: options.channelCount }) / 60,
	};
	onStep?.("Opening devices");
	let recorder: Recorder | null = null;
	try {
		recorder = await Recorder.open(options);
	} catch (error) {
		m.failed.push({
			device: error instanceof MediaAccessError ? error.device : "Devices",
			reason: error instanceof Error ? error.message : "couldn't open",
		});
	}
	try {
		if (recorder?.camera) {
			onStep?.("Counting camera frames");
			const r = await measureFps({ stream: recorder.camera });
			m.video.push({ device: "Camera", wantHeight: 1080, height: r.height, wantFps: 30, measuredFps: r.fps });
		}
		if (recorder?.screen) {
			onStep?.("Counting screen frames");
			const r = await measureFps({ stream: recorder.screen });
			m.video.push({
				device: "Screen",
				wantHeight: options.area ? r.height : Math.min(quality.height, r.height || quality.height),
				height: r.height,
				wantFps: quality.fps,
				measuredFps: r.fps,
				onChange: true,
			});
		}
	} finally {
		recorder?.release();
	}
	if (options.mode !== "voiceover") {
		onStep?.("Testing the encoder");
		const height = options.mode === "camera" ? 1080 : quality.height;
		m.encoderFps = await measureEncoder({ width: Math.round((height * 16) / 9 / 2) * 2, height, fps: quality.fps });
		m.encoderNeedFps = options.mode === "camera" ? 30 : quality.fps;
	}
	onStep?.("Testing disk speed");
	m.diskBytesPerSecond = await measureDisk();
	return evaluatePreflight(m);
}
