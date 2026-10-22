"use client";

import { generateUUID } from "@/utils/id";
import {
	CAMERA_BITS_PER_SECOND,
	QUALITY_PROFILES,
	type QualityProfile,
	type RecordingMode,
} from "./preflight";
import { SessionClock } from "./session";
import {
	assembleSession,
	type RecordedFile,
	type SessionManifest,
	type TrackManifest,
	type TrackRole,
	useRecordingSessions,
	writeChunk,
} from "./storage";
import { encodePcm16, peakDb } from "./wav";

/** Checkpoint interval: a crash loses at most this much (AR-11, SC-43). */
const CHUNK_MS = 1000;
const SAMPLE_RATE = 48_000;

const WORKLET = `
class Tap extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		if (input && input.length) this.port.postMessage(input.map((c) => c.slice()));
		return true;
	}
}
registerProcessor("frameflow-tap", Tap);
`;

export interface RecorderOptions {
	mode: RecordingMode;
	projectId: string;
	timelineStart: number;
	profile: QualityProfile;
	micId: string | null;
	cameraId: string | null;
	/** Electron screen or window id; the browser shows its own picker. */
	sourceId: string | null;
	systemAudio: boolean;
	channelCount: 1 | 2;
}

export interface RecordingResult {
	session: SessionManifest;
	files: RecordedFile[];
}

const needsScreen = (mode: RecordingMode) =>
	mode === "screen" || mode === "screen-camera";
const needsCamera = (mode: RecordingMode) =>
	mode === "camera" || mode === "screen-camera";

function pickMimeType(): string {
	const candidates = [
		"video/webm;codecs=vp9,opus",
		"video/webm;codecs=vp8,opus",
		"video/webm",
	];
	return (
		candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm"
	);
}

/** Screen capture can stall when the system can't grab the display. */
function withTimeout(request: Promise<MediaStream>): Promise<MediaStream> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			settled = true;
			reject(new Error("The screen didn't start in time"));
		}, 15_000);
		request.then(
			(stream) => {
				clearTimeout(timer);
				if (!settled) return resolve(stream);
				for (const track of stream.getTracks()) track.stop();
			},
			(error) => {
				clearTimeout(timer);
				if (!settled) reject(error);
			},
		);
	});
}

export class MediaAccessError extends Error {
	readonly device: "microphone" | "camera" | "screen";

	constructor({
		device,
		cause,
	}: {
		device: "microphone" | "camera" | "screen";
		cause: unknown;
	}) {
		super(
			cause instanceof DOMException && cause.name === "NotAllowedError"
				? `FrameFlow isn't allowed to use your ${device}.`
				: `Couldn't open your ${device}.`,
		);
		this.device = device;
	}
}

/**
 * A recording session: opens the devices (so the preview and meter work
 * before recording), then records every track against one clock.
 */
export class Recorder {
	readonly id = generateUUID();
	readonly clock = new SessionClock();
	screen: MediaStream | null = null;
	camera: MediaStream | null = null;
	mic: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private tap: AudioWorkletNode | null = null;
	private recorders: { role: TrackRole; recorder: MediaRecorder }[] = [];
	private chunkIndex: Partial<Record<TrackRole, number>> = {};
	private writes: Promise<void>[] = [];
	private pcm: Float32Array[][] = [];
	private pcmFrames = 0;
	private recording = false;
	private manifest: SessionManifest | null = null;
	private levelListeners = new Set<(db: number) => void>();
	private endedListeners = new Set<(device: TrackRole) => void>();

	private constructor(readonly options: RecorderOptions) {}

	static async open(options: RecorderOptions): Promise<Recorder> {
		const recorder = new Recorder(options);
		try {
			await recorder.acquire();
			return recorder;
		} catch (error) {
			recorder.release();
			throw error;
		}
	}

	private async acquire(): Promise<void> {
		const { mode, micId, cameraId, profile, sourceId, systemAudio } =
			this.options;
		const quality = QUALITY_PROFILES[profile];
		// Ask for each device only when the mode needs it (AR-19, SC-10).
		try {
			this.mic = await navigator.mediaDevices.getUserMedia({
				audio: {
					...(micId ? { deviceId: { exact: micId } } : {}),
					sampleRate: SAMPLE_RATE,
					channelCount: this.options.channelCount,
					echoCancellation: mode !== "voiceover",
					noiseSuppression: false,
					autoGainControl: false,
				},
			});
		} catch (error) {
			throw new MediaAccessError({ device: "microphone", cause: error });
		}
		if (needsCamera(mode)) {
			try {
				this.camera = await navigator.mediaDevices.getUserMedia({
					video: {
						...(cameraId ? { deviceId: { exact: cameraId } } : {}),
						width: { ideal: 1920 },
						height: { ideal: 1080 },
						frameRate: { ideal: 30 },
					},
				});
			} catch (error) {
				throw new MediaAccessError({ device: "camera", cause: error });
			}
		}
		if (needsScreen(mode)) {
			try {
				await window.worksuite?.capture?.choose(sourceId);
				this.screen = await withTimeout(
					navigator.mediaDevices.getDisplayMedia({
						video: {
							height: { ideal: quality.height },
							frameRate: { ideal: quality.fps },
						},
						audio: systemAudio,
					}),
				);
			} catch (error) {
				throw new MediaAccessError({ device: "screen", cause: error });
			}
		}
		for (const [role, stream] of [
			["screen", this.screen],
			["camera", this.camera],
			["mic", this.mic],
		] as const) {
			// A device going away pauses the take instead of ending it (SC-45).
			for (const track of stream?.getTracks() ?? []) {
				track.addEventListener("ended", () => {
					if (this.recording && !this.clock.paused) this.pause();
					for (const listener of this.endedListeners) listener(role);
				});
			}
		}
		await this.startMeter();
	}

	private async startMeter(): Promise<void> {
		if (!this.mic) return;
		const context = new AudioContext({ sampleRate: SAMPLE_RATE });
		const url = URL.createObjectURL(
			new Blob([WORKLET], { type: "text/javascript" }),
		);
		try {
			await context.audioWorklet.addModule(url);
		} finally {
			URL.revokeObjectURL(url);
		}
		const tap = new AudioWorkletNode(context, "frameflow-tap");
		tap.port.onmessage = (event: MessageEvent<Float32Array[]>) =>
			this.onAudio(event.data);
		context.createMediaStreamSource(this.mic).connect(tap);
		this.audioContext = context;
		this.tap = tap;
	}

	private onAudio(channels: Float32Array[]): void {
		const level = Math.max(...channels.map((c) => peakDb(c)));
		for (const listener of this.levelListeners) listener(level);
		if (!this.recording || this.clock.paused) return;
		const wanted = this.options.channelCount;
		this.pcm.push(
			Array.from({ length: wanted }, (_, i) => channels[i] ?? channels[0]),
		);
		this.pcmFrames += channels[0]?.length ?? 0;
		if (this.pcmFrames >= (SAMPLE_RATE * CHUNK_MS) / 1000) this.flushPcm();
	}

	private flushPcm(): void {
		if (this.pcm.length === 0) return;
		const wanted = this.options.channelCount;
		const merged = Array.from({ length: wanted }, (_, ch) => {
			const out = new Float32Array(this.pcmFrames);
			let offset = 0;
			for (const block of this.pcm) {
				out.set(block[ch], offset);
				offset += block[ch].length;
			}
			return out;
		});
		this.pcm = [];
		this.pcmFrames = 0;
		this.save({
			role: "mic",
			data: new Blob([new Uint8Array(encodePcm16(merged))]),
		});
	}

	private save({ role, data }: { role: TrackRole; data: Blob }): void {
		if (data.size === 0) return;
		const index = this.chunkIndex[role] ?? 0;
		this.chunkIndex[role] = index + 1;
		this.writes.push(
			writeChunk({ sessionId: this.id, role, index, data }).catch((error) =>
				console.error("Couldn't save recording chunk:", error),
			),
		);
	}

	onLevel(listener: (db: number) => void): () => void {
		this.levelListeners.add(listener);
		return () => this.levelListeners.delete(listener);
	}

	onDeviceEnded(listener: (device: TrackRole) => void): () => void {
		this.endedListeners.add(listener);
		return () => this.endedListeners.delete(listener);
	}

	/** Input latency to trim from the mic track (AR-22). */
	private latencyFrames(): number {
		const settings = this.mic?.getAudioTracks()[0]?.getSettings();
		const input =
			settings && "latency" in settings && typeof settings.latency === "number"
				? settings.latency
				: 0;
		return Math.round(
			(input + (this.audioContext?.baseLatency ?? 0)) * SAMPLE_RATE,
		);
	}

	start(): void {
		if (this.recording) return;
		const { mode, profile, projectId, timelineStart, channelCount } =
			this.options;
		const mimeType = pickMimeType();
		const tracks: TrackManifest[] = [];
		const addRecorder = ({
			role,
			label,
			stream,
			videoBitsPerSecond,
		}: {
			role: TrackRole;
			label: string;
			stream: MediaStream;
			videoBitsPerSecond: number;
		}) => {
			const recorder = new MediaRecorder(stream, {
				mimeType,
				videoBitsPerSecond,
			});
			recorder.ondataavailable = (event) =>
				this.save({ role, data: event.data });
			this.recorders.push({ role, recorder });
			tracks.push({ role, label, format: "webm" });
		};
		if (this.screen) {
			addRecorder({
				role: "screen",
				label: "Screen recording",
				stream: this.screen,
				videoBitsPerSecond: QUALITY_PROFILES[profile].videoBitsPerSecond,
			});
		}
		if (this.camera) {
			addRecorder({
				role: "camera",
				label: "Camera",
				stream: this.camera,
				videoBitsPerSecond: CAMERA_BITS_PER_SECOND,
			});
		}
		if (this.mic) {
			tracks.push({
				role: "mic",
				label: mode === "voiceover" ? "Voiceover" : "Microphone",
				format: "wav",
				sampleRate: SAMPLE_RATE,
				channelCount,
				skipFrames: this.latencyFrames(),
			});
		}
		this.manifest = {
			id: this.id,
			projectId,
			mode,
			startedAt: Date.now(),
			timelineStart,
			tracks,
			markers: [],
			duration: 0,
		};
		useRecordingSessions.getState().save(this.manifest);
		this.recording = true;
		this.clock.start();
		for (const { recorder } of this.recorders) recorder.start(CHUNK_MS);
	}

	pause(): void {
		if (!this.recording || this.clock.paused) return;
		this.clock.pause();
		for (const { recorder } of this.recorders) {
			if (recorder.state === "recording") recorder.pause();
		}
	}

	resume(): void {
		if (!this.recording || !this.clock.paused) return;
		this.clock.resume();
		for (const { recorder } of this.recorders) {
			if (recorder.state === "paused") recorder.resume();
		}
	}

	get isRecording(): boolean {
		return this.recording;
	}

	addMarker(): number | null {
		if (!this.manifest) return null;
		const at = this.clock.elapsed();
		this.manifest = {
			...this.manifest,
			markers: [...this.manifest.markers, at],
			duration: at,
		};
		useRecordingSessions.getState().save(this.manifest);
		return at;
	}

	async stop(): Promise<RecordingResult> {
		if (!this.manifest) throw new Error("Not recording");
		const duration = this.clock.elapsed();
		this.recording = false;
		await Promise.all(
			this.recorders.map(
				({ recorder }) =>
					new Promise<void>((resolve) => {
						if (recorder.state === "inactive") return resolve();
						recorder.addEventListener("stop", () => resolve(), { once: true });
						recorder.stop();
					}),
			),
		);
		this.flushPcm();
		await Promise.all(this.writes);
		this.manifest = { ...this.manifest, duration };
		useRecordingSessions.getState().save(this.manifest);
		this.release();
		return {
			session: this.manifest,
			files: await assembleSession(this.manifest),
		};
	}

	/** Stops all devices; the take (if any) stays recoverable. */
	release(): void {
		this.recording = false;
		for (const { recorder } of this.recorders) {
			if (recorder.state !== "inactive") recorder.stop();
		}
		for (const stream of [this.screen, this.camera, this.mic]) {
			for (const track of stream?.getTracks() ?? []) track.stop();
		}
		this.tap?.disconnect();
		void this.audioContext?.close().catch(() => {});
		this.audioContext = null;
	}
}
