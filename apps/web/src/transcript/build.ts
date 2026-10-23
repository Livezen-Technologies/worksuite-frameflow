import type { EditorCore } from "@/core";
import { loadFonts } from "@/fonts/google-fonts";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import type { SubtitleCue } from "@/subtitles/types";
import { buildCuesFromTranscript } from "./cues";
import type { Transcript } from "./types";

export const SINHALA_CAPTION_FONT = "Noto Sans Sinhala";

/**
 * Places the transcript on a new caption track. Sinhala transcripts use the
 * bundled Noto Sans Sinhala; Latin words in mixed lines fall back to the
 * system sans-serif at the same size.
 */
export async function buildSubtitlesFromTranscript({
	editor,
	transcript,
}: {
	editor: EditorCore;
	transcript: Transcript;
}): Promise<{ trackId: string | null; cueCount: number }> {
	const hasSinhala = transcript.segments.some(
		(segment) => segment.lang === "si" || segment.lang === "mixed",
	);
	if (hasSinhala) {
		await loadFonts({ families: [SINHALA_CAPTION_FONT] });
	}
	const cues: SubtitleCue[] = buildCuesFromTranscript({ transcript }).map(
		(cue) => ({
			...cue,
			// Sinhala vowel signs reach above and below the line: give them room.
			...(hasSinhala
				? { style: { fontFamily: SINHALA_CAPTION_FONT, lineHeight: 1.45 } }
				: {}),
		}),
	);
	const trackId = insertCaptionChunksAsTextTrack({
		editor,
		captions: cues,
		narrationTrackId: transcript.narrationTrackId ?? null,
	});
	return { trackId, cueCount: cues.length };
}
