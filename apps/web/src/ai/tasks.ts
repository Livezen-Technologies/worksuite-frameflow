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

export class AiError extends Error {
	readonly code: string;
	constructor({ message, code }: { message: string; code: string }) {
		super(message);
		this.code = code;
	}
}

const MESSAGES: Record<string, string> = {
	"no-key": "Add your Gemini API key in Settings → AI.",
	key: "Gemini didn't accept the API key. Check it in Settings → AI.",
	quota:
		"Your Gemini quota is used up for now. Try again later or check your Google AI plan.",
	offline: "You're working offline. Turn off offline mode to use AI features.",
	server: "Gemini is having trouble right now. Try again in a minute.",
};

async function generate({
	request,
	parts,
}: {
	request: { system: string; schema: object };
	parts: ({ text: string } | { data: ArrayBuffer; mimeType: string })[];
}): Promise<string> {
	const bridge = aiBridge();
	if (!bridge)
		throw new AiError({
			message: "AI features need the desktop app.",
			code: "unavailable",
		});
	const { model } = useAiSettings.getState();
	const result = await bridge.generate({
		model: model || undefined,
		system: request.system,
		parts,
		schema: request.schema,
	});
	if (!result.ok)
		throw new AiError({
			message: MESSAGES[result.code] ?? result.message,
			code: result.code,
		});
	return result.text;
}

async function runTextBatches({
	transcript,
	build,
	onProgress,
}: {
	transcript: Transcript;
	build: (segments: Transcript["segments"]) => TextRequest;
	onProgress?: (progress: number) => void;
}): Promise<Map<string, string>> {
	const groups = batches({ items: transcript.segments });
	const results = new Map<string, string>();
	for (const [index, group] of groups.entries()) {
		onProgress?.(index / groups.length);
		const request = build(group);
		const text = await generate({ request, parts: [{ text: request.text }] });
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
		const text = await generate({
			request,
			parts: [
				{
					data: encodeWav({
						samples: samples.subarray(chunk.start, chunk.end),
						sampleRate,
					}),
					mimeType: "audio/wav",
				},
				{ text: request.text },
			],
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
