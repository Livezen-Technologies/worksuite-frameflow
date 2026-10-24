import type { EditorCore } from "@/core";
import { estimateWords } from "@/captions/words";
import { timeWords } from "./voice-words";
import { generateTranscript } from "@/transcript/generate";
import type { TextElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";

/**
 * Times a text clip's words to the voice under it: transcribes the timeline
 * audio, keeps the words spoken while the clip is on screen, and lines them
 * up with the clip's text. Word times are seconds from the clip's start.
 * When no speech is found the words are spread evenly over the clip.
 */
export async function syncTextToVoice({
	editor,
	element,
	onStep,
}: {
	editor: EditorCore;
	element: TextElement;
	onStep?: (step: string) => void;
}): Promise<ReturnType<typeof timeWords>> {
	const content = String(element.params.content ?? "");
	const start = element.startTime / TICKS_PER_SECOND;
	const end = start + element.duration / TICKS_PER_SECOND;
	const transcript = await generateTranscript({
		editor,
		language: "auto",
		engine: "local",
		narrationTrackId: null,
		onStep,
	});
	const spoken = transcript.segments
		.flatMap((segment) => segment.words ?? estimateWords(segment))
		.filter((word) => word.end > start && word.start < end)
		.map((word) => ({
			text: word.text,
			start: Math.max(0, word.start - start),
			end: Math.min(end, word.end) - start,
		}));
	return timeWords({ content, spoken, durationSeconds: end - start });
}
