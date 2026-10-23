import type { Transcript } from "@/transcript/types";
import type { TranscriptionSegment } from "@/transcription/types";
import { aiBridge } from "./bridge";
import { encodeWav, splitAtPauses } from "./audio";
import {
	applyTextResults,
	batches,
	buildCleanupRequest,
	buildTranscribeRequest,
	buildTranslateRequest,
	languageName,
	parseTextResults,
	parseTranscribeResult,
	type TextRequest,
} from "./prompts";
import { useAiSettings } from "./store";
import { AiError, aiProvider } from "./provider";

export { AiError };

/** Cost estimates shown before a job runs (SRS AI-47). */
export function estimateTextJob({ transcript }: { transcript: Transcript }) {
	const chars = transcript.segments.reduce((n, s) => n + s.text.length + 40, 0);
	return aiProvider().estimateCost({ textChars: chars, outputChars: chars });
}

export function estimateTranscription({ seconds }: { seconds: number }) {
	return aiProvider().estimateCost({ audioSeconds: seconds, outputChars: seconds * 18 });
}

async function runTextBatches({
	transcript,
	build,
	onProgress,
	kind,
}: {
	kind: string;
	transcript: Transcript;
	build: (segments: Transcript["segments"]) => TextRequest;
	onProgress?: (progress: number) => void;
}): Promise<Map<string, string>> {
	const groups = batches({ items: transcript.segments });
	const results = new Map<string, string>();
	for (const [index, group] of groups.entries()) {
		onProgress?.(index / groups.length);
		const request = build(group);
		const { text } = await aiProvider().rewriteText({ request, kind });
		for (const [id, value] of parseTextResults(text)) results.set(id, value);
	}
	onProgress?.(1);
	return results;
}

/** Translate every segment, keeping its timing (SRS AI-01). */
export async function aiTranslate({
	transcript,
	target,
	onProgress,
}: {
	transcript: Transcript;
	target: string;
	onProgress?: (progress: number) => void;
}) {
	const { vocabulary } = useAiSettings.getState();
	const results = await runTextBatches({
		transcript,
		onProgress,
		kind: "translate",
		build: (segments) =>
			buildTranslateRequest({ segments, target, vocabulary }),
	});
	if (!results.size)
		throw new AiError({
			message: "Gemini returned no translation.",
			code: "empty",
		});
	return applyTextResults({
		transcript,
		results,
		language: target,
		engine: `${transcript.engine} · translated to ${languageName(target)} by Gemini`,
	});
}

/** Fix spelling, punctuation and misheard words (SRS AI-02). */
export async function aiCleanUp({
	transcript,
	removeFillers,
	onProgress,
}: {
	transcript: Transcript;
	removeFillers: boolean;
	onProgress?: (progress: number) => void;
}) {
	const { vocabulary } = useAiSettings.getState();
	const results = await runTextBatches({
		transcript,
		onProgress,
		kind: "clean-up",
		build: (segments) =>
			buildCleanupRequest({
				segments,
				language: transcript.language,
				removeFillers,
				vocabulary,
			}),
	});
	return applyTextResults({ transcript, results });
}

/** Cloud transcription with Gemini, in ~4-minute chunks (SRS AI-03). */
export async function aiTranscribe({
	samples,
	sampleRate,
	language,
	onProgress,
}: {
	samples: Float32Array;
	sampleRate: number;
	language: string;
	onProgress?: (progress: number) => void;
}): Promise<TranscriptionSegment[]> {
	const { vocabulary } = useAiSettings.getState();
	const chunks = splitAtPauses({ samples, sampleRate });
	const segments: TranscriptionSegment[] = [];
	for (const [index, chunk] of chunks.entries()) {
		onProgress?.(index / chunks.length);
		const duration = (chunk.end - chunk.start) / sampleRate;
		const request = buildTranscribeRequest({ language, vocabulary, duration });
		const { text } = await aiProvider().transcribe({
			request,
			audio: {
				data: encodeWav({
					samples: samples.subarray(chunk.start, chunk.end),
					sampleRate,
				}),
				mimeType: "audio/wav",
				seconds: duration,
			},
		});
		segments.push(
			...parseTranscribeResult({
				text,
				offset: chunk.start / sampleRate,
				duration,
			}),
		);
	}
	onProgress?.(1);
	return segments;
}

export function cancelAi() {
	void aiBridge()?.cancel();
}
