import type { EditorCore } from "@/core";
import { aiBridge } from "@/ai/bridge";
import { aiTranscribe } from "@/ai/tasks";
import { onlyTrack } from "@/captions/narration";
import { decodeAudioToFloat32 } from "@/media/audio";
import { extractTimelineAudio } from "@/media/mediabunny";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_MODELS,
} from "@/transcription/models";
import { createTranscript } from "./transcript";
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
}: {
	editor: EditorCore;
	language: TranscriptionLanguage;
	engine: "local" | "gemini";
	narrationTrackId: string | null;
	onStep?: (step: string) => void;
	/** Local Whisper's model-loading and transcribing progress. */
	onWhisperProgress?: (progress: TranscriptionProgress) => void;
}): Promise<Transcript> {
	onStep?.("Extracting audio...");
	const allTracks = editor.scenes.getActiveScene().tracks;
	const audioBlob = await extractTimelineAudio({
		tracks: narrationTrackId
			? onlyTrack({ tracks: allTracks, trackId: narrationTrackId })
			: allTracks,
		mediaAssets: editor.media.getAssets(),
		totalDuration: editor.timeline.getTotalDuration(),
	});

	onStep?.("Preparing audio...");
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
	});

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
					onProgress: onWhisperProgress,
				})
			).segments;

	const modelName =
		TRANSCRIPTION_MODELS.find((m) => m.id === DEFAULT_TRANSCRIPTION_MODEL)
			?.name ?? "Whisper";
	return createTranscript({
		segments,
		language,
		engine: useGemini ? "Gemini (cloud)" : `Local Whisper ${modelName}`,
		narrationTrackId,
	});
}
