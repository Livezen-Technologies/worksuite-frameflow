/**
 * Singlish (phonetic Latin) to Sinhala transliteration (SRS TI-02, TI-09,
 * TI-16, TI-17). Rule based: the Latin is split into consonant and vowel
 * units, longest match first; a consonant without a vowel gets the virama,
 * and the conjuncts are written with ZWJ the way Unicode spells them:
 * yansaya C්‍ය, rakaransaya C්‍ර, repaya ර්‍C.
 */

const HAL = "්";
const ZWJ = "‍";

const CONSONANTS: [string, string][] = [
	["nndh", "ඳ"],
	["nnd", "ඬ"],
	["nng", "ඟ"],
	["mmb", "ඹ"],
	["chh", "ඡ"],
	["kh", "ඛ"],
	["gh", "ඝ"],
	["ch", "ච"],
	["jh", "ඣ"],
	["Ny", "ඤ"],
	["gn", "ඥ"],
	["Th", "ථ"],
	["th", "ත"],
	["Dh", "ධ"],
	["dh", "ද"],
	["ph", "ඵ"],
	["bh", "භ"],
	["Sh", "ෂ"],
	["sh", "ශ"],
	["k", "ක"],
	["g", "ග"],
	["j", "ජ"],
	["T", "ඨ"],
	["t", "ට"],
	["D", "ඪ"],
	["d", "ඩ"],
	["N", "ණ"],
	["n", "න"],
	["p", "ප"],
	["f", "ෆ"],
	["b", "බ"],
	["m", "ම"],
	["y", "ය"],
	["r", "ර"],
	["L", "ළ"],
	["l", "ල"],
	["v", "ව"],
	["w", "ව"],
	["S", "ෂ"],
	["s", "ස"],
	["h", "හ"],
	["G", "ඟ"],
	["K", "ඛ"],
	["B", "ඹ"],
	["c", "ච"],
	["q", "ක"],
	["z", "ස"],
];

/** [latin, independent vowel, vowel sign] — sign "" is the inherent a. */
const VOWELS: [string, string, string][] = [
	["aae", "ඈ", "ෑ"],
	["Aa", "ඈ", "ෑ"],
	["aa", "ආ", "ා"],
	["ae", "ඇ", "ැ"],
	["ai", "ඓ", "ෛ"],
	["au", "ඖ", "ෞ"],
	["ii", "ඊ", "ී"],
	["ee", "ඊ", "ී"],
	["ie", "ඊ", "ී"],
	["uu", "ඌ", "ූ"],
	["ei", "ඒ", "ේ"],
	["oo", "ඕ", "ෝ"],
	["Ru", "ඍ", "ෘ"],
	["A", "ඇ", "ැ"],
	["E", "ඒ", "ේ"],
	["I", "ඊ", "ී"],
	["U", "ඌ", "ූ"],
	["O", "ඕ", "ෝ"],
	["a", "අ", ""],
	["i", "ඉ", "ි"],
	["u", "උ", "ු"],
	["e", "එ", "ෙ"],
	["o", "ඔ", "ො"],
];

const SIGNS: [string, string][] = [
	["x", "ං"],
	["H", "ඃ"],
];

type Unit =
	| { kind: "consonant"; latin: string; char: string }
	| { kind: "vowel"; latin: string; independent: string; sign: string }
	| { kind: "sign"; latin: string; char: string }
	| { kind: "other"; latin: string };

function matchAt<T extends [string, ...string[]]>({
	text,
	index,
	table,
}: {
	text: string;
	index: number;
	table: T[];
}): T | null {
	let best: T | null = null;
	for (const row of table) {
		if (text.startsWith(row[0], index) && (!best || row[0].length > best[0].length))
			best = row;
	}
	return best;
}

export function tokenizeSinglish({ text }: { text: string }): Unit[] {
	const units: Unit[] = [];
	let i = 0;
	while (i < text.length) {
		const vowel = matchAt({ text, index: i, table: VOWELS });
		const consonant = matchAt({ text, index: i, table: CONSONANTS });
		const sign = matchAt({ text, index: i, table: SIGNS });
		// "ng" before a consonant or at the end is the anusvara (lanka, sing).
		if (text.startsWith("ng", i)) {
			const after = text[i + 2];
			if (after === undefined || !/[aeiouAEIOU]/.test(after)) {
				units.push({ kind: "sign", latin: "ng", char: "ං" });
				i += 2;
				continue;
			}
		}
		const candidates = [vowel, consonant, sign].filter((m) => m !== null);
		const longest = candidates.reduce<string[] | null>(
			(a, b) => (!a || b[0].length > a[0].length ? b : a),
			null,
		);
		if (!longest) {
			units.push({ kind: "other", latin: text[i] });
			i += 1;
			continue;
		}
		if (longest === vowel && vowel)
			units.push({
				kind: "vowel",
				latin: vowel[0],
				independent: vowel[1],
				sign: vowel[2],
			});
		else if (longest === consonant && consonant)
			units.push({ kind: "consonant", latin: consonant[0], char: consonant[1] });
		else if (sign) units.push({ kind: "sign", latin: sign[0], char: sign[1] });
		i += longest[0].length;
	}
	return units;
}

export function renderUnits({ units }: { units: Unit[] }): string {
	let out = "";
	for (let i = 0; i < units.length; i++) {
		const unit = units[i];
		const prev = units[i - 1];
		const next = units[i + 1];
		if (unit.kind === "vowel") {
			out += prev?.kind === "consonant" ? unit.sign : unit.independent;
			continue;
		}
		if (unit.kind === "sign") {
			out += unit.char;
			continue;
		}
		if (unit.kind === "other") {
			out += unit.latin;
			continue;
		}
		if (next?.kind === "vowel") {
			out += unit.char;
			continue;
		}
		// Conjuncts: the next consonant is ya or ra followed by a vowel.
		const afterNext = units[i + 2];
		if (
			next?.kind === "consonant" &&
			afterNext?.kind === "vowel" &&
			(next.char === "ය" || next.char === "ර")
		) {
			out += unit.char + HAL + ZWJ;
			continue;
		}
		if (unit.char === "ර" && next?.kind === "consonant" && next.char !== "ය") {
			out += unit.char + HAL + ZWJ;
			continue;
		}
		out += unit.char + HAL;
	}
	return out;
}

/** Transliterates one run of Singlish; non-letters pass through. */
export function singlishToSinhala({ text }: { text: string }): string {
	return renderUnits({ units: tokenizeSinglish({ text }) });
}

/** Converts every Latin word of a text, keeping `backtick` spans as typed (TI-17, TI-06). */
export function convertSinglishText({ text }: { text: string }): string {
	return text
		.split(/(`[^`]*`)/)
		.map((part) =>
			part.startsWith("`") && part.endsWith("`") && part.length >= 2
				? part.slice(1, -1)
				: part.replace(/[A-Za-z]+/g, (word) => singlishToSinhala({ text: word })),
		)
		.join("");
}

// Spellings Singlish can't tell apart: each unit may stand for these letters.
const CONSONANT_ALTERNATIVES: Record<string, string[]> = {
	ට: ["ත"],
	ත: ["ට"],
	ඩ: ["ද"],
	ද: ["ඩ"],
	න: ["ණ"],
	ණ: ["න"],
	ල: ["ළ"],
	ළ: ["ල"],
	ස: ["ශ"],
	ශ: ["ෂ", "ස"],
	ක: ["ඛ"],
	ග: ["ඝ"],
	බ: ["භ"],
	ප: ["ඵ"],
};

const VOWEL_ALTERNATIVES: Record<string, [string, string][]> = {
	a: [["ආ", "ා"], ["ඇ", "ැ"]],
	aa: [["අ", ""]],
	i: [["ඊ", "ී"]],
	ii: [["ඉ", "ි"]],
	ee: [["ඉ", "ි"]],
	u: [["ඌ", "ූ"]],
	e: [["ඒ", "ේ"], ["ඇ", "ැ"]],
	o: [["ඕ", "ෝ"]],
	oo: [["ඔ", "ො"]],
	ae: [["ඈ", "ෑ"]],
};

/**
 * All spellings the Latin could mean, the plain rule output first, capped
 * so long words stay cheap. Used to look words up in the dictionary.
 */
export function singlishVariants({
	text,
	limit = 64,
}: {
	text: string;
	limit?: number;
}): string[] {
	// "lanka" is usually ලංකා: n before k may be the anusvara.
	const nasal = text.replace(/n(?=k)/g, "ng");
	if (nasal !== text)
		return [
			...new Set([
				...unitVariants({ text, limit: limit / 2 }),
				...unitVariants({ text: nasal, limit: limit / 2 }),
			]),
		];
	return unitVariants({ text, limit });
}

function unitVariants({ text, limit }: { text: string; limit: number }): string[] {
	const units = tokenizeSinglish({ text });
	let variants: Unit[][] = [units];
	units.forEach((unit, index) => {
		const options: Unit[] = [];
		if (unit.kind === "consonant")
			for (const char of CONSONANT_ALTERNATIVES[unit.char] ?? [])
				options.push({ ...unit, char });
		if (unit.kind === "vowel")
			for (const [independent, sign] of VOWEL_ALTERNATIVES[unit.latin] ?? [])
				options.push({ ...unit, independent, sign });
		if (options.length === 0) return;
		const next: Unit[][] = [];
		for (const variant of variants) {
			next.push(variant);
			for (const option of options) {
				if (next.length >= limit) break;
				const copy = variant.slice();
				copy[index] = option;
				next.push(copy);
			}
		}
		variants = next.slice(0, limit);
	});
	return [...new Set(variants.map((v) => renderUnits({ units: v })))];
}

// Sinhala to Singlish, for a readable romanised line (TI-16).
const ROMAN_CONSONANTS: Record<string, string> = {};
for (const [latin, char] of CONSONANTS)
	if (!(char in ROMAN_CONSONANTS) && latin.length <= 3) ROMAN_CONSONANTS[char] = latin;
Object.assign(ROMAN_CONSONANTS, {
	ට: "t",
	ත: "th",
	ඩ: "d",
	ද: "d",
	ණ: "n",
	ළ: "l",
	ෂ: "sh",
	ඤ: "gn",
	ඟ: "ng",
	ඬ: "nd",
	ඳ: "nd",
	ඹ: "mb",
	ව: "w",
});
const ROMAN_SIGNS: Record<string, string> = {
	"": "a",
	"ා": "aa",
	"ැ": "ae",
	"ෑ": "ae",
	"ි": "i",
	"ී": "ee",
	"ු": "u",
	"ූ": "oo",
	"ෙ": "e",
	"ේ": "e",
	"ෛ": "ai",
	"ො": "o",
	"ෝ": "o",
	"ෞ": "au",
	"ෘ": "ru",
};
const ROMAN_INDEPENDENT: Record<string, string> = {
	අ: "a",
	ආ: "aa",
	ඇ: "ae",
	ඈ: "ae",
	ඉ: "i",
	ඊ: "ee",
	උ: "u",
	ඌ: "oo",
	එ: "e",
	ඒ: "e",
	ඓ: "ai",
	ඔ: "o",
	ඕ: "o",
	ඖ: "au",
	ඍ: "ru",
	"ං": "ng",
	"ඃ": "h",
};

export function sinhalaToSinglish({ text }: { text: string }): string {
	let out = "";
	const chars = [...text];
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i];
		if (char === ZWJ) continue;
		const consonant = ROMAN_CONSONANTS[char];
		if (consonant) {
			const next = chars[i + 1];
			if (next === HAL) {
				out += consonant;
				i += 1;
				continue;
			}
			if (next !== undefined && next in ROMAN_SIGNS) {
				out += consonant + ROMAN_SIGNS[next];
				i += 1;
				continue;
			}
			out += consonant + "a";
			continue;
		}
		out += ROMAN_INDEPENDENT[char] ?? char;
	}
	return out;
}

export function hasSinhala({ text }: { text: string }): boolean {
	return /[඀-෿]/.test(text);
}
