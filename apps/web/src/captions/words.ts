/**
 * Word-level timing for captions (SRS AI-46). Words carry their own start
 * and end; text rewritten later (AI clean-up, translation, hand edits) is
 * re-aligned to the timed words before word highlighting uses it.
 */
export interface TimedWord {
	text: string;
	/** Seconds. */
	start: number;
	end: number;
}

const normal = (word: string) =>
	word.toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, "");

export function splitWords(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

/** Even split by length when nothing better is known (estimated timing). */
export function estimateWords({
	text,
	start,
	end,
}: {
	text: string;
	start: number;
	end: number;
}): TimedWord[] {
	const words = splitWords(text);
	const total = words.reduce((n, w) => n + w.length, 0) || 1;
	let cursor = start;
	return words.map((word) => {
		const span = ((end - start) * word.length) / total;
		const timed = { text: word, start: cursor, end: cursor + span };
		cursor += span;
		return timed;
	});
}

/**
 * Re-aligns new text to timed words: words that are unchanged keep their
 * times (longest common subsequence), new or changed words share the time
 * between their aligned neighbours by length. `matched` is the share of
 * new words that kept a real time.
 */
export function realignWords({
	words,
	text,
}: {
	words: TimedWord[];
	text: string;
}): { words: TimedWord[]; matched: number } {
	const next = splitWords(text);
	if (next.length === 0) return { words: [], matched: 1 };
	if (words.length === 0) return { words: [], matched: 0 };
	const a = words.map((w) => normal(w.text));
	const b = next.map(normal);
	// LCS table.
	const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			dp[i]![j] =
				a[i] && a[i] === b[j]
					? (dp[i + 1]![j + 1] ?? 0) + 1
					: Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
	const pairs = new Map<number, number>();
	for (let i = 0, j = 0; i < a.length && j < b.length; ) {
		if (a[i] && a[i] === b[j]) {
			pairs.set(j, i);
			i++;
			j++;
		} else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) i++;
		else j++;
	}
	const first = words[0]!;
	const last = words[words.length - 1]!;
	const out: TimedWord[] = new Array(next.length);
	let j = 0;
	while (j < next.length) {
		const i = pairs.get(j);
		if (i !== undefined) {
			const w = words[i]!;
			out[j] = { text: next[j]!, start: w.start, end: w.end };
			j++;
			continue;
		}
		// A run of unmatched words: fill the gap between aligned neighbours.
		let k = j;
		while (k < next.length && !pairs.has(k)) k++;
		const before = j > 0 ? out[j - 1]!.end : first.start;
		const afterIndex = k < next.length ? pairs.get(k) : undefined;
		const after = afterIndex !== undefined ? words[afterIndex]!.start : last.end;
		const run = next.slice(j, k);
		const filled = estimateWords({
			text: run.join(" "),
			start: before,
			end: Math.max(before, after),
		});
		filled.forEach((w, n) => {
			out[j + n] = w;
		});
		j = k;
	}
	return { words: out, matched: pairs.size / next.length };
}

/** Index of the word being spoken at `seconds`, or -1 between words. */
export function wordIndexAt({
	words,
	seconds,
}: {
	words: TimedWord[];
	seconds: number;
}): number {
	for (let i = 0; i < words.length; i++) {
		const w = words[i]!;
		const nextStart = words[i + 1]?.start ?? w.end;
		// Hold a word until the next one starts, so short gaps don't flicker.
		if (seconds >= w.start && seconds < Math.max(w.end, nextStart)) return i;
	}
	return -1;
}

/**
 * Groups model word timings into transcript segments: a new segment at a
 * pause, at sentence ends, or when one gets long.
 */
export function groupWords({
	words,
	maxSeconds = 7,
	maxChars = 84,
	pause = 0.7,
}: {
	words: TimedWord[];
	maxSeconds?: number;
	maxChars?: number;
	pause?: number;
}): { text: string; start: number; end: number; words: TimedWord[] }[] {
	const out: { text: string; start: number; end: number; words: TimedWord[] }[] = [];
	let current: TimedWord[] = [];
	const flush = () => {
		if (!current.length) return;
		out.push({
			text: current.map((w) => w.text).join(" "),
			start: current[0]!.start,
			end: current[current.length - 1]!.end,
			words: current,
		});
		current = [];
	};
	for (const word of words) {
		const text = word.text.trim();
		if (!text) continue;
		const prev = current[current.length - 1];
		const chars = current.reduce((n, w) => n + w.text.length + 1, 0);
		if (
			prev &&
			(word.start - prev.end > pause ||
				word.end - (current[0]?.start ?? word.start) > maxSeconds ||
				chars + text.length > maxChars)
		)
			flush();
		current.push({ ...word, text });
		if (/[.!?।]$/.test(text)) flush();
	}
	flush();
	return out;
}
