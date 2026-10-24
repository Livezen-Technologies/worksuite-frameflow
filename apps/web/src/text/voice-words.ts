import { estimateWords, realignWords, type TimedWord } from "@/captions/words";

/** Lines a clip's text up with the words a voice spoke (seconds from the clip's start). */
export function timeWords({
	content,
	spoken,
	durationSeconds,
}: {
	content: string;
	spoken: TimedWord[];
	durationSeconds: number;
}): { words: TimedWord[]; matched: number } {
	if (spoken.length === 0)
		return { words: estimateWords({ text: content, start: 0, end: durationSeconds }), matched: 0 };
	const aligned = realignWords({ words: spoken, text: content });
	if (aligned.matched > 0) return aligned;
	// Different words (say, a translation): follow the speech's pace instead.
	return {
		words: estimateWords({
			text: content,
			start: spoken[0]!.start,
			end: spoken[spoken.length - 1]!.end,
		}),
		matched: 0,
	};
}

/** Graphemes to show: every word the voice has reached so far. */
export function voiceRevealWords({
	words,
	seconds,
}: {
	words: TimedWord[];
	seconds: number;
}): number {
	let shown = 0;
	for (const word of words) if (seconds >= word.start) shown += 1;
	return shown;
}
