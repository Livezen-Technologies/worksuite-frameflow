import { SINHALA_WORDS, TAMIL_WORDS } from "./dictionary";
import { singlishToSinhala, singlishVariants } from "./sinhala";
import { tamilPhonetic, tamilVariants } from "./tamil";

export type InputLanguage = "si" | "ta";

/** How often the user picked each word for a typed Latin key (TI-11). */
export type LearnedChoices = Record<string, Record<string, number>>;

const RANK: Record<InputLanguage, Map<string, number>> = {
	si: new Map(SINHALA_WORDS.map((w, i) => [w, i])),
	ta: new Map(TAMIL_WORDS.map((w, i) => [w, i])),
};

/**
 * Adds a full word list behind the starter words (TI-10): starter words
 * keep their rank, new words follow in the list's order.
 */
export function addDictionaryWords({
	language,
	words,
}: {
	language: InputLanguage;
	words: string[];
}): void {
	const rank = RANK[language];
	for (const word of words) if (word && !rank.has(word)) rank.set(word, rank.size);
}

/** Whether a word is in the dictionary (TI-13). */
export function isDictionaryWord({
	language,
	word,
}: {
	language: InputLanguage;
	word: string;
}): boolean {
	return RANK[language].has(word);
}

export function dictionaryWords(language: InputLanguage): Iterable<string> {
	return RANK[language].keys();
}

const loaded = new Map<InputLanguage, Promise<void>>();

/** Loads public/dictionaries/<language>.txt once (see LICENSE.md there). */
export function loadDictionary(language: InputLanguage): Promise<void> {
	let task = loaded.get(language);
	if (!task) {
		task = fetch(`/dictionaries/${language}.txt`)
			.then((r) => (r.ok ? r.text() : ""))
			.then((text) => addDictionaryWords({ language, words: text.split("\n").map((w) => w.trim()) }))
			.catch(() => {
				// Offline or missing file: the starter list still works.
			});
		loaded.set(language, task);
	}
	return task;
}

export function transliterate({
	latin,
	language,
}: {
	latin: string;
	language: InputLanguage;
}): string {
	return language === "si"
		? singlishToSinhala({ text: latin })
		: tamilPhonetic({ text: latin });
}

/**
 * Up to `limit` spellings for the Latin typed so far (TI-09, TI-10): the
 * user's past picks, then dictionary and project words the Latin could
 * spell, then completions of the plain spelling, then the plain spelling.
 */
export function suggest({
	latin,
	language,
	learned = {},
	extraWords = [],
	limit = 5,
}: {
	latin: string;
	language: InputLanguage;
	learned?: LearnedChoices;
	extraWords?: Iterable<string>;
	limit?: number;
}): string[] {
	if (!latin) return [];
	const plain = transliterate({ latin, language });
	const variants =
		language === "si" ? singlishVariants({ text: latin }) : tamilVariants({ text: latin });
	const rank = RANK[language];
	const extra = new Set(extraWords);
	const known = (word: string) => rank.has(word) || extra.has(word);
	const rankOf = (word: string) => rank.get(word) ?? Number.MAX_SAFE_INTEGER;

	const picked = Object.entries(learned[latin] ?? {})
		.sort((a, b) => b[1] - a[1])
		.map(([word]) => word);
	const matches = variants.filter(known).sort((a, b) => rankOf(a) - rankOf(b));
	const completions: string[] = [];
	if (plain.length >= 2) {
		for (const word of [...rank.keys(), ...extra]) {
			if (completions.length >= limit) break;
			if (word !== plain && word.startsWith(plain)) completions.push(word);
		}
	}
	const ordered = [...picked, ...matches, plain, ...completions, ...variants];
	return [...new Set(ordered)].slice(0, limit);
}

export function recordChoice({
	learned,
	latin,
	word,
}: {
	learned: LearnedChoices;
	latin: string;
	word: string;
}): LearnedChoices {
	const forKey = { ...(learned[latin] ?? {}) };
	forKey[word] = (forKey[word] ?? 0) + 1;
	return { ...learned, [latin]: forKey };
}

/** Most likely words after `previous`, from what the user has typed (TI-12). */
export function nextWordSuggestions({
	previous,
	nextWords,
	limit = 5,
}: {
	previous: string;
	nextWords: Record<string, Record<string, number>>;
	limit?: number;
}): string[] {
	return Object.entries(nextWords[previous] ?? {})
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([word]) => word);
}

/** The word just before `at` in `text`, if any. */
export function wordBefore({ text, at }: { text: string; at: number }): string {
	const match = /(\S+)\s*$/.exec(text.slice(0, at));
	return match?.[1] ?? "";
}
