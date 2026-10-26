import type { EditorCore } from "@/core";
import { loadFonts } from "@/fonts/google-fonts";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import type { SubtitleCue } from "@/subtitles/types";
import { buildCuesFromTranscript } from "./cues";
import type { Transcript } from "./types";
import { useTranscriptStore } from "./store";

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
		// Building again replaces the earlier caption track instead of stacking a second one.
		replaceTrackId: transcript.captionTrackId ?? null,
	});
	if (trackId) {
		// Remember the track so the next build replaces it.
		const projectId = editor.project.getActive().metadata.id;
		const store = useTranscriptStore.getState();
		const latest = store.byProject[projectId];
		if (latest) store.setTranscript({ projectId, transcript: { ...latest, captionTrackId: trackId } });
	}
	return { trackId, cueCount: cues.length };
}
