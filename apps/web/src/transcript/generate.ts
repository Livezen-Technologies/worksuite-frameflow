import type { EditorCore } from "@/core";
import { aiBridge } from "@/ai/bridge";
import { aiTranscribe } from "@/ai/tasks";
import { onlyTrack } from "@/captions/narration";
import { decodeAudioToFloat32 } from "@/media/audio";
import { extractTimelineAudio } from "@/media/mediabunny";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { LANGUAGES, type LanguageCode } from "@/transcription/languages";
import { modelForLanguage, TRANSCRIPTION_MODELS } from "@/transcription/models";
import { transcriptionSettings } from "@/transcription/settings-store";
import { createTranscript, replaceSegment } from "./transcript";
import type { Transcript } from "./types";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";

/**
 * Transcribes the timeline's audio (or one narration track) with local
 * Whisper or Gemini. Shared by the Captions panel and the automation API.
 */
export async function generateTranscript({
	editor,
	language,
	engine,
	narrationTrackId,
	onStep,
	onWhisperProgress,
	onPartial,
}: {
	editor: EditorCore;
	language: TranscriptionLanguage;
	engine: "local" | "gemini";
	narrationTrackId: string | null;
	onStep?: (step: string) => void;
	/** Local Whisper's model-loading and transcribing progress. */
	onWhisperProgress?: (progress: TranscriptionProgress) => void;
	/** The transcript so far, as local Whisper finishes each piece of audio. */
	onPartial?: (transcript: Transcript) => void;
}): Promise<Transcript> {
	onStep?.("Extracting audio...");
	const samples = await timelineSamples({ editor, narrationTrackId });
	const settings = transcriptionSettings();
	const engineName = (modelId: string) =>
		`Local Whisper ${TRANSCRIPTION_MODELS.find((m) => m.id === modelId)?.name ?? "Whisper"}`;

	const useGemini = engine === "gemini" && !!aiBridge();
	const segments = useGemini
		? await aiTranscribe({
				samples,
				sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
				language,
				onProgress: (p) =>
					onStep?.(`Transcribing with Gemini ${Math.round(p * 100)}%`),
			})
		: (
				await transcriptionService.transcribe({
					audioData: samples,
					language: language === "auto" ? undefined : language,
					modelId: settings.modelId,
					chunkSeconds: settings.chunkSeconds,
					mixedSinhalaEnglish: settings.mixedSinhalaEnglish,
					onProgress: onWhisperProgress,
					onSegments: onPartial
						? (partial) =>
								onPartial(
									createTranscript({ segments: partial, language, engine: engineName(settings.modelId), narrationTrackId }),
								)
						: undefined,
				})
			).segments;

	const modelId = language === "auto" ? settings.modelId : modelForLanguage({ language, modelId: settings.modelId });
	return createTranscript({
		segments,
		language,
		engine: useGemini ? "Gemini (cloud)" : engineName(modelId),
		narrationTrackId,
	});
}

async function timelineSamples({
	editor,
	narrationTrackId,
}: {
	editor: EditorCore;
	narrationTrackId: string | null;
}): Promise<Float32Array> {
	const allTracks = editor.scenes.getActiveScene().tracks;
	const audioBlob = await extractTimelineAudio({
		tracks: narrationTrackId
			? onlyTrack({ tracks: allTracks, trackId: narrationTrackId })
			: allTracks,
		mediaAssets: editor.media.getAssets(),
		totalDuration: editor.timeline.getTotalDuration(),
	});
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
	});
	return samples;
}

/**
 * Transcribes one line again from its own audio (a little either side) and
 * puts the result in its place. Uses local Whisper and the transcript's language.
 */
export async function regenerateSegment({
	editor,
	transcript,
	id,
	onProgress,
}: {
	editor: EditorCore;
	transcript: Transcript;
	id: string;
	onProgress?: (progress: TranscriptionProgress) => void;
}): Promise<Transcript> {
	const segment = transcript.segments.find((s) => s.id === id);
	if (!segment) return transcript;
	const samples = await timelineSamples({ editor, narrationTrackId: transcript.narrationTrackId ?? null });
	const rate = DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const start = Math.max(0, segment.start - 0.3);
	const end = Math.min(samples.length / rate, segment.end + 0.3);
	const slice = samples.slice(Math.floor(start * rate), Math.ceil(end * rate));
	const settings = transcriptionSettings();
	const language: LanguageCode | undefined = LANGUAGES.find(
		(l) => l.code === transcript.language,
	)?.code;
	const result = await transcriptionService.transcribe({
		audioData: slice,
		language,
		modelId: settings.modelId,
		chunkSeconds: 15,
		offset: start,
		mixedSinhalaEnglish: settings.mixedSinhalaEnglish,
		onProgress,
	});
	if (!result.segments.length) throw new Error("No speech was found in that line");
	return replaceSegment({ transcript, id, segments: result.segments });
}
