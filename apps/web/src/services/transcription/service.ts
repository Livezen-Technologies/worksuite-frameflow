import { WHISPER_HOSTS } from "@/models/portal";
import { ensureReleaseModel } from "@/transcription/release-model";
import { SAMPLE_RATE, sinhalaShare } from "@/transcription/segmenter";
import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionProgress,
	TranscriptionModelId,
} from "@/transcription/types";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	modelForLanguage,
	TRANSCRIPTION_MODELS,
} from "@/transcription/models";
import type { WorkerMessage, WorkerResponse } from "./worker";

type ProgressCallback = (progress: TranscriptionProgress) => void;

class TranscriptionService {
	private worker: Worker | null = null;
	private currentModelId: TranscriptionModelId | null = null;
	private isInitialized = false;
	private isInitializing = false;

	async transcribe({
		audioData,
		language = "auto",
		modelId = DEFAULT_TRANSCRIPTION_MODEL,
		chunkSeconds = 10,
		offset = 0,
		mixedSinhalaEnglish = false,
		onProgress,
		onSegments,
	}: {
		audioData: Float32Array;
		language?: TranscriptionLanguage;
		modelId?: TranscriptionModelId;
		/** Target length of each piece of audio, 5–15 s. */
		chunkSeconds?: number;
		/** Seconds added to every time, when `audioData` is part of a longer track. */
		offset?: number;
		/** Sinhala only: re-run pieces that came back mostly non-Sinhala or unsure with `modelId` in English. */
		mixedSinhalaEnglish?: boolean;
		onProgress?: ProgressCallback;
		/** Lines so far, as each short piece of audio is transcribed. */
		onSegments?: (segments: TranscriptionResult["segments"]) => void;
	}): Promise<TranscriptionResult> {
		// Sinhala goes to the Sinhala fine-tune; it falls back to the chosen model if that can't load.
		const preferred = language === "auto" ? modelId : modelForLanguage({ language, modelId });
		try {
			await this.ensureWorker({ modelId: preferred, onProgress });
		} catch (error) {
			if (preferred === modelId) throw error;
			await this.ensureWorker({ modelId, onProgress });
		}
		const usedSpecific = this.currentModelId !== modelId;

		const result = await this.run({ audioData, language, chunkSeconds, offset, onProgress, onSegments });
		if (!(mixedSinhalaEnglish && language === "si" && usedSpecific)) return result;

		// Mixed Sinhala/English: pieces the Sinhala model wasn't sure of, or
		// that came back mostly in Latin letters, get a second try in English.
		const pieces = new Map<string, { start: number; end: number; confidence: number }>();
		for (const segment of result.segments) {
			if (!segment.piece) continue;
			const unsure = (segment.confidence ?? 1) < 0.6 || sinhalaShare(segment.text) < 0.5;
			if (!unsure) continue;
			const key = `${segment.piece.start}:${segment.piece.end}`;
			pieces.set(key, { ...segment.piece, confidence: Math.min(pieces.get(key)?.confidence ?? 1, segment.confidence ?? 1) });
		}
		if (!pieces.size) return result;
		await this.ensureWorker({ modelId, onProgress });
		let segments = result.segments;
		let done = 0;
		for (const piece of pieces.values()) {
			const from = Math.max(0, Math.floor((piece.start - offset) * SAMPLE_RATE));
			const to = Math.min(audioData.length, Math.ceil((piece.end - offset) * SAMPLE_RATE));
			const english = await this.run({ audioData: audioData.slice(from, to), language: "en", chunkSeconds: 15, offset: piece.start });
			const englishConfidence = Math.min(...english.segments.map((s) => s.confidence ?? 0), 1);
			if (english.segments.length && englishConfidence > piece.confidence) {
				segments = [
					...segments.filter((s) => !(s.piece && s.piece.start === piece.start && s.piece.end === piece.end)),
					...english.segments.map((s) => ({ ...s, piece: { start: piece.start, end: piece.end } })),
				].sort((x, y) => x.start - y.start);
				onSegments?.(segments);
			}
			done++;
			onProgress?.({ status: "transcribing", progress: Math.round((done / pieces.size) * 100), message: `Checking English words… ${done}/${pieces.size}` });
		}
		return { ...result, segments, text: segments.map((s) => s.text).join(" ") };
	}

	/** One pass of the loaded model over `audioData`. */
	private run({
		audioData,
		language,
		chunkSeconds,
		offset,
		onProgress,
		onSegments,
	}: {
		audioData: Float32Array;
		language: TranscriptionLanguage;
		chunkSeconds: number;
		offset: number;
		onProgress?: ProgressCallback;
		onSegments?: (segments: TranscriptionResult["segments"]) => void;
	}): Promise<TranscriptionResult> {
		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker not initialized"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "transcribe-partial":
						onSegments?.(response.segments);
						onProgress?.({
							status: "transcribing",
							progress: response.progress,
							message: `Transcribing… ${response.segments.length} lines so far`,
						});
						break;

					case "transcribe-progress":
						onProgress?.({
							status: "transcribing",
							progress: response.progress,
							message: "Transcribing audio...",
						});
						break;

					case "transcribe-complete":
						this.worker?.removeEventListener("message", handleMessage);
						resolve({
							text: response.text,
							segments: response.segments,
							language,
						});
						break;

					case "transcribe-error":
						this.worker?.removeEventListener("message", handleMessage);
						reject(new Error(response.error));
						break;

					case "cancelled":
						this.worker?.removeEventListener("message", handleMessage);
						reject(new Error("Transcription cancelled"));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			this.worker.postMessage({
				type: "transcribe",
				audio: audioData,
				language,
				chunkSeconds,
				offset,
			} satisfies WorkerMessage);
		});
	}

	/** Downloads a model ahead of time (Settings → Local models). */
	async preload({
		modelId,
		onProgress,
	}: {
		modelId: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<void> {
		await this.ensureWorker({ modelId, onProgress });
	}

	cancel() {
		this.worker?.postMessage({ type: "cancel" } satisfies WorkerMessage);
	}

	private async ensureWorker({
		modelId,
		onProgress,
	}: {
		modelId: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<void> {
		const needsNewModel = this.currentModelId !== modelId;

		if (this.worker && this.isInitialized && !needsNewModel) {
			return;
		}

		if (this.isInitializing && !needsNewModel) {
			await this.waitForInit();
			return;
		}

		this.terminate();
		this.isInitializing = true;
		this.isInitialized = false;

		const model = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);
		if (!model) {
			throw new Error(`Unknown model: ${modelId}`);
		}

		// Fine-tunes published as release files are put into the model cache first.
		if (model.release) {
			try {
				await ensureReleaseModel({
					model,
					onProgress: (p) => onProgress?.({ status: "loading-model", progress: Math.round(p * 100), message: `Downloading ${model.name} model...` }),
				});
			} catch (error) {
				this.isInitializing = false;
				throw error;
			}
		}

		this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Failed to create worker"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "init-progress":
						onProgress?.({
							status: "loading-model",
							progress: response.progress,
							message: `Loading ${model.name} model...`,
						});
						break;

					case "init-complete":
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitialized = true;
						this.isInitializing = false;
						this.currentModelId = modelId;
						resolve();
						break;

					case "init-error":
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitializing = false;
						this.terminate();
						reject(new Error(response.error));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			this.worker.postMessage({
				type: "init",
				modelId: model.huggingFaceId,
				// Release models are already in the cache under their Hugging Face URLs.
				remoteHosts: model.release ? ["https://huggingface.co/"] : WHISPER_HOSTS,
			} satisfies WorkerMessage);
		});
	}

	private waitForInit(): Promise<void> {
		return new Promise((resolve) => {
			const checkInit = () => {
				if (this.isInitialized) {
					resolve();
				} else if (!this.isInitializing) {
					resolve();
				} else {
					setTimeout(checkInit, 100);
				}
			};
			checkInit();
		});
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
		this.isInitialized = false;
		this.isInitializing = false;
		this.currentModelId = null;
	}
}

export const transcriptionService = new TranscriptionService();
