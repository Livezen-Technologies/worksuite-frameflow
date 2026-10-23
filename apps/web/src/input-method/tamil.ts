/**
 * Tamil phonetic typing (SRS TI-05): Latin as it sounds becomes Tamil
 * Unicode, a consonant without a vowel taking the pulli (்).
 */

const PULLI = "்";

const CONSONANTS: [string, string][] = [
	["ksh", "க்ஷ"],
	["ng", "ங"],
	["nj", "ஞ"],
	["ny", "ஞ"],
	["ch", "ச"],
	["th", "த"],
	["dh", "த"],
	["zh", "ழ"],
	["sh", "ஷ"],
	["k", "க"],
	["g", "க"],
	["c", "ச"],
	["s", "ச"],
	["S", "ஸ"],
	["j", "ஜ"],
	["t", "ட"],
	["d", "ட"],
	["T", "ட"],
	["N", "ண"],
	["n", "ன"],
	["p", "ப"],
	["b", "ப"],
	["f", "ப"],
	["m", "ம"],
	["y", "ய"],
	["r", "ர"],
	["R", "ற"],
	["l", "ல"],
	["L", "ள"],
	["v", "வ"],
	["w", "வ"],
	["h", "ஹ"],
];

const VOWELS: [string, string, string][] = [
	["aa", "ஆ", "ா"],
	["ai", "ஐ", "ை"],
	["au", "ஔ", "ௌ"],
	["ii", "ஈ", "ீ"],
	["ee", "ஈ", "ீ"],
	["uu", "ஊ", "ூ"],
	["oo", "ஓ", "ோ"],
	["A", "ஆ", "ா"],
	["I", "ஈ", "ீ"],
	["U", "ஊ", "ூ"],
	["E", "ஏ", "ே"],
	["O", "ஓ", "ோ"],
	["a", "அ", ""],
	["i", "இ", "ி"],
	["u", "உ", "ு"],
	["e", "எ", "ெ"],
	["o", "ஒ", "ொ"],
];

function longest<T extends [string, ...string[]]>({
	text,
	index,
	table,
}: {
	text: string;
	index: number;
	table: T[];
}): T | null {
	let best: T | null = null;
	for (const row of table)
		if (text.startsWith(row[0], index) && (!best || row[0].length > best[0].length))
			best = row;
	return best;
}

export function tamilPhonetic({ text }: { text: string }): string {
	let out = "";
	let i = 0;
	let afterConsonant = false;
	while (i < text.length) {
		const vowel = longest({ text, index: i, table: VOWELS });
		const consonant = longest({ text, index: i, table: CONSONANTS });
		if (vowel && (!consonant || vowel[0].length >= consonant[0].length)) {
			out += afterConsonant ? vowel[2] : vowel[1];
			afterConsonant = false;
			i += vowel[0].length;
			continue;
		}
		if (afterConsonant) out += PULLI;
		if (consonant) {
			// "n" starts a word as dental ந, otherwise the alveolar ன.
			const char =
				consonant[0] === "n" && (out === "" || /\s$/.test(out)) ? "ந" : consonant[1];
			out += char;
			afterConsonant = true;
			i += consonant[0].length;
			continue;
		}
		out += text[i];
		afterConsonant = false;
		i += 1;
	}
	if (afterConsonant) out += PULLI;
	return out;
}

const ALTERNATIVES: Record<string, string[]> = {
	ன: ["ண", "ந"],
	ண: ["ன"],
	ந: ["ன"],
	ல: ["ள", "ழ"],
	ள: ["ல"],
	ர: ["ற"],
	ற: ["ர"],
};

/** Spellings that differ only in letters Latin can't tell apart. */
export function tamilVariants({ text, limit = 32 }: { text: string; limit?: number }): string[] {
	const base = [...tamilPhonetic({ text })];
	let variants = [base];
	base.forEach((char, index) => {
		const options = ALTERNATIVES[char];
		if (!options) return;
		const next: string[][] = [];
		for (const v of variants) {
			next.push(v);
			for (const option of options) {
				const copy = v.slice();
				copy[index] = option;
				next.push(copy);
			}
		}
		variants = next.slice(0, limit);
	});
	return [...new Set(variants.map((v) => v.join("")))];
}
