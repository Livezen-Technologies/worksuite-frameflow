/**
 * Spell check for Sinhala and Tamil (SRS TI-13): words not in the
 * dictionary, the user's own words or the learned picks, each with the
 * closest dictionary words as suggestions.
 */
import { dictionaryWords, type InputLanguage } from "./candidates";

const SCRIPT: Record<InputLanguage, RegExp> = {
	si: /[඀-෿‍]+/g,
	ta: /[஀-௿]+/g,
};

export interface Misspelling {
	word: string;
	start: number;
	suggestions: string[];
}

/** Edit distance over code points, giving up above `max`. */
export function editDistance({ a, b, max }: { a: string; b: string; max: number }): number {
	const x = [...a];
	const y = [...b];
	if (Math.abs(x.length - y.length) > max) return max + 1;
	let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
	for (let i = 1; i <= x.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= y.length; j++) {
			const cost = x[i - 1] === y[j - 1] ? 0 : 1;
			row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
			best = Math.min(best, row[j]);
		}
		if (best > max) return max + 1;
		prev = row;
	}
	return prev[y.length];
}

export function closestWords({
	word,
	language,
	limit = 4,
}: {
	word: string;
	language: InputLanguage;
	limit?: number;
}): string[] {
	const found: { word: string; distance: number; rank: number }[] = [];
	let rank = 0;
	for (const candidate of dictionaryWords(language)) {
		rank++;
		const distance = editDistance({ a: word, b: candidate, max: 2 });
		if (distance <= 2) found.push({ word: candidate, distance, rank });
	}
	return found
		.sort((a, b) => a.distance - b.distance || a.rank - b.rank)
		.slice(0, limit)
		.map((f) => f.word);
}

export function findMisspellings({
	text,
	language,
	isKnown,
}: {
	text: string;
	language: InputLanguage;
	isKnown: (word: string) => boolean;
}): Misspelling[] {
	const out: Misspelling[] = [];
	for (const match of text.matchAll(SCRIPT[language])) {
		const word = match[0].replace(/‍+$/, "");
		if (!word || isKnown(word)) continue;
		out.push({ word, start: match.index ?? 0, suggestions: closestWords({ word, language }) });
	}
	return out;
}

/** The script a piece of text is mostly in, for choosing the dictionary. */
export function languageOf(text: string): InputLanguage | null {
	const si = text.match(SCRIPT.si)?.join("").length ?? 0;
	const ta = text.match(SCRIPT.ta)?.join("").length ?? 0;
	if (!si && !ta) return null;
	return si >= ta ? "si" : "ta";
}
