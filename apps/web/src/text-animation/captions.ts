import { breakLines, countUnits, unitSegments } from "./segment";
import type { TextAnimation } from "./types";

export interface CaptionLike {
	content: string;
	/** Seconds from the caption's start (AI-46 word timings). */
	words?: Array<{ text: string; start: number; end: number }>;
}

/**
 * One animation for a caption clip: with word timings, word (or line)
 * units start when they are spoken; without them, the animation's own
 * stagger is used. Units that don't line up with the timed words (text
 * edited after transcription) fall back to the stagger too.
 */
export function animationForCaption({ animation, caption }: { animation: TextAnimation; caption: CaptionLike }): TextAnimation {
	const { unitTimes: _drop, ...base } = animation;
	const words = caption.words ?? [];
	if (words.length === 0 || (animation.unit !== "word" && animation.unit !== "line")) return base;
	const wordCount = countUnits(caption.content, "word");
	if (wordCount !== words.length) return base;
	if (animation.unit === "word") return { ...base, unitTimes: words.map((w) => ({ start: w.start, end: w.end })) };
	const lines = breakLines(caption.content);
	const times: Array<{ start: number; end: number }> = [];
	let cursor = 0;
	for (const line of lines) {
		const n = unitSegments(line, "word").filter((s) => !s.space).length;
		if (n === 0) continue;
		const first = words[cursor]!;
		const last = words[cursor + n - 1]!;
		times.push({ start: first.start, end: last.end });
		cursor += n;
	}
	return { ...base, unitTimes: times };
}

/** Patches for applying one animation across a caption track (one undo step for the caller). */
export function applyToCaptionTrack<T extends { id: string; params: Record<string, unknown>; words?: CaptionLike["words"] }>({
	elements,
	animation,
}: {
	elements: T[];
	animation: TextAnimation;
}): Array<{ elementId: string; textAnimation: TextAnimation }> {
	return elements.map((el) => ({
		elementId: el.id,
		textAnimation: animationForCaption({ animation, caption: { content: String(el.params.content ?? ""), words: el.words } }),
	}));
}
