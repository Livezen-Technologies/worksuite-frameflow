import {
	env,
	pipeline,
	type AutomaticSpeechRecognitionPipeline,
	type AutomaticSpeechRecognitionOutput,
} from "@huggingface/transformers";
import type { TranscriptionSegment } from "@/transcription/types";
import { groupWords } from "@/captions/words";
import { SAMPLE_RATE, cleanText, estimateConfidence, looksHallucinated, planChunks, speechRegions, splitIntoLines } from "@/transcription/segmenter";

export type WorkerMessage =
	| { type: "init"; modelId: string; remoteHosts: string[] }
	| { type: "transcribe"; audio: Float32Array; language: string; chunkSeconds?: number; offset?: number }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	/** Segments so far, as each short piece finishes. */
	| { type: "transcribe-partial"; progress: number; segments: TranscriptionSegment[] }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({ modelId: message.modelId, remoteHosts: message.remoteHosts });
			break;
		case "transcribe":
			await handleTranscribe({
				audio: message.audio,
				language: message.language,
				chunkSeconds: message.chunkSeconds ?? 10,
				offset: message.offset ?? 0,
			});
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({
	modelId,
	remoteHosts,
}: {
	modelId: string;
	remoteHosts: string[];
}) {
	// The download center first, then Hugging Face.
	let lastError: unknown = null;
	for (const host of remoteHosts) {
		env.remoteHost = host;
		lastError = await loadPipeline({ modelId });
		if (!lastError) return;
	}
	self.postMessage({
		type: "init-error",
		error: lastError instanceof Error ? lastError.message : String(lastError),
	} satisfies WorkerResponse);
}

/** Loads the model; returns the error instead of reporting it. */
async function loadPipeline({ modelId }: { modelId: string }): Promise<unknown> {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		transcriber = (await pipeline("automatic-speech-recognition", modelId, {
			dtype: "q4",
			device: "auto",
			progress_callback: (progressInfo: {
				status?: string;
				file?: string;
				loaded?: number;
				total?: number;
			}) => {
				const file = progressInfo.file;
				if (!file) return;

				const loaded = progressInfo.loaded ?? 0;
				const total = progressInfo.total ?? 0;

				if (progressInfo.status === "progress" && total > 0) {
					fileBytes.set(file, { loaded, total });
				} else if (progressInfo.status === "done") {
					const existing = fileBytes.get(file);
					if (existing) {
						fileBytes.set(file, {
							loaded: existing.total,
							total: existing.total,
						});
					}
				}

				// sum all bytes
				let totalLoaded = 0;
				let totalSize = 0;
				for (const { loaded, total } of fileBytes.values()) {
					totalLoaded += loaded;
					totalSize += total;
				}

				if (totalSize === 0) return;

				const overallProgress = (totalLoaded / totalSize) * 100;
				const roundedProgress = Math.floor(overallProgress);

				if (roundedProgress !== lastReportedProgress) {
					lastReportedProgress = roundedProgress;
					self.postMessage({
						type: "init-progress",
						progress: roundedProgress,
					} satisfies WorkerResponse);
				}
			},
		})) as unknown as AutomaticSpeechRecognitionPipeline;

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
		return null;
	} catch (error) {
		return error ?? new Error("Failed to load model");
	}
}

async function handleTranscribe({
	audio,
	language,
	chunkSeconds,
	offset,
}: {
	audio: Float32Array;
	language: string;
	chunkSeconds: number;
	/** Seconds added to every time (when `audio` is part of a longer track). */
	offset: number;
}) {
	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;

	try {
		// Short pieces cut at pauses (see transcription/segmenter.ts), each
		// transcribed on its own so timestamps come from its place in the audio.
		const target = Math.min(15, Math.max(5, chunkSeconds));
		const chunks = planChunks({ audio, regions: speechRegions({ audio }), target, min: Math.min(5, target), max: Math.max(15, target) });
		const lang = language === "auto" ? undefined : language;
		// Word timings are reliable for English; for Sinhala Whisper's
		// alignment drifts, so keep honest phrase-level timestamps there.
		let words = lang === "en";
		const segments: TranscriptionSegment[] = [];
		const texts: string[] = [];
		self.postMessage({ type: "transcribe-progress", progress: 0 } satisfies WorkerResponse);

		// Pieces still to do; an empty or garbled piece comes back as two halves.
		const queue: { start: number; end: number; retried?: boolean }[] = [...chunks];
		const totalSeconds = chunks.reduce((n, c) => n + (c.end - c.start), 0) || 1;
		let doneSeconds = 0;
		while (queue.length) {
			if (cancelled) return;
			const chunk = queue.shift();
			if (!chunk) break;
			const slice = audio.subarray(Math.floor(chunk.start * SAMPLE_RATE), Math.ceil(chunk.end * SAMPLE_RATE));
			const length = chunk.end - chunk.start;
			let raw: Awaited<ReturnType<AutomaticSpeechRecognitionPipeline>>;
			try {
				raw = await transcriber(slice, { language: lang, task: "transcribe", return_timestamps: words ? "word" : true });
			} catch {
				words = false;
				raw = await transcriber(slice, { language: lang, task: "transcribe", return_timestamps: true });
			}
			const result: AutomaticSpeechRecognitionOutput = Array.isArray(raw) ? raw[0] : raw;
			const timed = (result.chunks ?? [])
				.filter((c) => c.timestamp && c.timestamp.length >= 2)
				.map((c) => ({
					text: words ? c.text : cleanText(c.text),
					start: chunk.start + Math.min(length, Math.max(0, c.timestamp[0] ?? 0)),
					end: chunk.start + Math.min(length, Math.max(0, c.timestamp[1] ?? length)),
				}))
				.filter((c) => c.text.trim());
			const pieceText = cleanText(result.text ?? "");
			const usable = pieceText && !looksHallucinated({ text: pieceText, seconds: length });
			// Whisper sometimes returns nothing (or a loop) for a longer piece
			// that does have speech; shorter halves usually come back right.
			if (!usable && !chunk.retried && length >= 4) {
				const middle = chunk.start + length / 2;
				queue.unshift({ start: chunk.start, end: middle, retried: true }, { start: middle, end: chunk.end, retried: true });
				continue;
			}
			doneSeconds += length;
			if (usable) {
				texts.push(pieceText);
				const confidence = estimateConfidence({ raw: result.text ?? "", text: pieceText, seconds: length, language: lang });
				const piece = { start: chunk.start + offset, end: chunk.end + offset };
				let lines: TranscriptionSegment[];
				if (words && timed.length) lines = groupWords({ words: timed });
				else if (timed.length > 1)
					lines = timed.flatMap((t) => splitIntoLines({ text: t.text, start: t.start, end: Math.max(t.end, t.start + 0.2) }));
				// One phrase: it spans the speech it came from, cut into caption-sized lines.
				else lines = splitIntoLines({ text: pieceText, start: chunk.start, end: chunk.end });
				segments.push(
					...lines.map((line) => ({
						...line,
						start: line.start + offset,
						end: line.end + offset,
						...(line.words ? { words: line.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })) } : {}),
						confidence,
						piece,
					})),
				);
			}
			self.postMessage({
				type: "transcribe-partial",
				progress: Math.min(100, Math.round((doneSeconds / totalSeconds) * 100)),
				segments: [...segments],
			} satisfies WorkerResponse);
		}

		self.postMessage({
			type: "transcribe-complete",
			text: texts.join(" "),
			segments,
		} satisfies WorkerResponse);
	} catch (error) {
		if (cancelled) return;
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed",
		} satisfies WorkerResponse);
	}
}
