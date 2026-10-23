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
