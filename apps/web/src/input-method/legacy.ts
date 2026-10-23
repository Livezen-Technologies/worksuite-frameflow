/**
 * Unicode ⇄ legacy Sinhala font encodings (SRS TI-18 – TI-23). Legacy
 * fonts (FM, DL and the like) draw Sinhala glyphs on Latin code points, so
 * text is stored as Unicode and converted only when drawn, copied out, or
 * pasted in. FM and DL fonts share the Wijesekara-based glyph layout below.
 *
 * Unicode keeps vowel signs after the consonant; legacy text types the
 * kombuva (ෙ) first, so the converters reorder around each syllable.
 */

const HAL = "්";
const ZWJ = "‍";

/** Base letters, longest legacy sequence first where they overlap. */
const LETTERS: [string, string][] = [
	["අ", "w"],
	["ආ", "wd"],
	["ඇ", "we"],
	["ඈ", "wE"],
	["ඉ", "b"],
	["ඊ", "B"],
	["උ", "W"],
	["ඌ", "W!"],
	["ඍ", "R"],
	["එ", "t"],
	["ඒ", "ta"],
	["ඓ", "ft"],
	["ඔ", "T"],
	["ඕ", "´"],
	["ඖ", "T!"],
	["ක", "l"],
	["ඛ", "L"],
	["ග", "."],
	["ඝ", ">"],
	["ඞ", "X"],
	["ඟ", "`"],
	["ච", "p"],
	["ඡ", "P"],
	["ජ", "c"],
	["ඣ", "CO"],
	["ඤ", "["],
	["ඥ", "{"],
	["ට", "g"],
	["ඨ", "G"],
	["ඩ", "v"],
	["ඪ", "V"],
	["ණ", "K"],
	["ඬ", "~"],
	["ත", ";"],
	["ථ", ":"],
	["ද", "o"],
	["ධ", "O"],
	["න", "k"],
	["ඳ", "|"],
	["ප", "m"],
	["ඵ", "M"],
	["බ", "n"],
	["භ", "N"],
	["ම", "u"],
	["ඹ", "U"],
	["ය", "h"],
	["ර", "r"],
	["ල", ","],
	["ව", "j"],
	["ශ", "Y"],
	["ෂ", "I"],
	["ස", "i"],
	["හ", "y"],
	["ළ", "<"],
	["ෆ", "*"],
	["ං", "x"],
	["ඃ", "#"],
];

/** Vowel signs that follow the consonant in both encodings. */
const SIGNS: [string, string][] = [
	[HAL, "a"],
	["ා", "d"],
	["ැ", "e"],
	["ෑ", "E"],
	["ි", "s"],
	["ී", "S"],
	["ු", "q"],
	["ූ", "Q"],
	["ෘ", "D"],
	["ෟ", "!"],
];

const YANSAYA = { unicode: HAL + ZWJ + "ය", legacy: "H" };
const RAKARANSAYA = { unicode: HAL + ZWJ + "ර", legacy: "%" };
const REPAYA = { unicode: "ර" + HAL + ZWJ, legacy: "¾" };
const KOMBUVA = "f";

/** Signs written as a kombuva before the syllable plus a tail after it. */
const SPLIT_SIGNS: Record<string, { before: string; after: string }> = {
	"ෙ": { before: KOMBUVA, after: "" },
	"ේ": { before: KOMBUVA, after: "a" },
	"ෛ": { before: KOMBUVA + KOMBUVA, after: "" },
	"ො": { before: KOMBUVA, after: "d" },
	"ෝ": { before: KOMBUVA, after: "da" },
	"ෞ": { before: KOMBUVA, after: "!" },
};

const LETTER_TO_LEGACY = new Map(LETTERS);
const SIGN_TO_LEGACY = new Map(SIGNS);

export const LEGACY_FONT_FAMILIES = [
	"FM Abhaya",
	"FM Malithi",
	"FM Bindumathi",
	"FM Ganganee",
	"FM Gemunu",
	"FM Derana",
	"FM Emanee",
	"FM Arjunn",
	"FM Basuru",
	"DL Manel",
	"DL Paras",
	"DL Araliya",
	"Kaputa",
] as const;

export function isLegacyFont({ fontFamily }: { fontFamily: string }): boolean {
	const name = fontFamily.trim().toLowerCase();
	return (
		/^(fm|dl|iskpota|kaputa)[\s_-]/.test(name) ||
		LEGACY_FONT_FAMILIES.some((f) => f.toLowerCase() === name)
	);
}

const CONSONANT = "[\\u0D9A-\\u0DC6]";
const SYLLABLE = new RegExp(
	`(${CONSONANT}(?:${HAL}${ZWJ}[යර])?)([\\u0DD9-\\u0DDE])`,
	"g",
);

export function unicodeToLegacy({ text }: { text: string }): string {
	let s = text.replace(/්‍?ය/g, (m) =>
		m.length === 3 ? YANSAYA.legacy : m,
	);
	// Repaya: ර්‍ + consonant is written after that consonant.
	s = s.replace(new RegExp(`ර${HAL}${ZWJ}(${CONSONANT})`, "g"), "$1" + REPAYA.legacy);
	// Kombuva signs move in front of the consonant cluster.
	s = s.replace(SYLLABLE, (_, cluster: string, sign: string) => {
		const split = SPLIT_SIGNS[sign];
		return split ? split.before + cluster + split.after : cluster + sign;
	});
	s = s.replaceAll(RAKARANSAYA.unicode, RAKARANSAYA.legacy);
	let out = "";
	for (const char of s) {
		if (char === ZWJ) continue;
		out += LETTER_TO_LEGACY.get(char) ?? SIGN_TO_LEGACY.get(char) ?? char;
	}
	return out;
}

// Reverse tables: longest legacy sequence first.
const LEGACY_LETTERS = [...LETTERS].sort((a, b) => b[1].length - a[1].length);

export function legacyToUnicode({ text }: { text: string }): string {
	let out = "";
	let i = 0;
	const readLetter = (): string | null => {
		for (const [unicode, legacy] of LEGACY_LETTERS)
			if (text.startsWith(legacy, i)) {
				i += legacy.length;
				return unicode;
			}
		return null;
	};
	const readCluster = (): string | null => {
		const letter = readLetter();
		if (letter === null) return null;
		let cluster = letter;
		if (text[i] === YANSAYA.legacy) {
			cluster += YANSAYA.unicode;
			i += 1;
		} else if (text[i] === RAKARANSAYA.legacy) {
			cluster += RAKARANSAYA.unicode;
			i += 1;
		}
		if (text[i] === REPAYA.legacy) {
			cluster = REPAYA.unicode + cluster;
			i += 1;
		}
		return cluster;
	};
	while (i < text.length) {
		if (text[i] === KOMBUVA) {
			const double = text[i + 1] === KOMBUVA;
			i += double ? 2 : 1;
			const cluster = readCluster();
			if (cluster === null) {
				out += double ? "ෛ" : "ෙ";
				continue;
			}
			if (double) {
				out += cluster + "ෛ";
				continue;
			}
			if (text.startsWith("da", i)) {
				out += cluster + "ෝ";
				i += 2;
			} else if (text[i] === "d") {
				out += cluster + "ො";
				i += 1;
			} else if (text[i] === "a") {
				out += cluster + "ේ";
				i += 1;
			} else if (text[i] === "!") {
				out += cluster + "ෞ";
				i += 1;
			} else out += cluster + "ෙ";
			continue;
		}
		const cluster = readCluster();
		if (cluster !== null) {
			out += cluster;
			continue;
		}
		const sign = SIGNS.find(([, legacy]) => text.startsWith(legacy, i));
		if (sign && out.length > 0 && /[඀-෿]$/.test(out)) {
			out += sign[0];
			i += sign[1].length;
			continue;
		}
		out += text[i];
		i += 1;
	}
	return out;
}

/**
 * Whether pasted text looks like legacy-encoded Sinhala (TI-20): no Sinhala
 * code points, and most words read as nonsense in English but convert to
 * mostly Sinhala.
 */
export function looksLikeLegacy({ text }: { text: string }): boolean {
	if (/[඀-෿]/.test(text)) return false;
	const words = text.split(/\s+/).filter((w) => w.length > 1);
	if (words.length === 0) return false;
	let odd = 0;
	for (const word of words) {
		const hasLegacyMarks = /[;%|<>{}[\]`~¾´:,]/.test(word.slice(0, -1));
		const noVowels = !/[aeiouyAEIOUY]/.test(word.replace(/^[a]|a$/g, ""));
		const kombuva = /^f[a-zA-Z.;,<|]/.test(word);
		const mixedCase = /[a-z][A-Z]/.test(word);
		if (hasLegacyMarks || noVowels || kombuva || mixedCase) odd += 1;
	}
	return odd / words.length >= 0.5;
}
