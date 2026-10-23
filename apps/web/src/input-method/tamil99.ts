/**
 * Tamil99 keyboard (SRS TI-05), the Tamil Nadu government standard layout.
 * Keys are turned into Tamil as typed, with the layout's rules: a vowel key
 * after a consonant gives the vowel sign, `f` adds the pulli, and a doubled
 * consonant or a nasal followed by its stop gets the pulli by itself.
 */

const PULLI = "்";

const CONSONANTS: Record<string, string> = {
	h: "க", b: "ங", "[": "ச", "]": "ஞ", o: "ட", p: "ண", l: "த", ";": "ந",
	j: "ப", k: "ம", "'": "ய", m: "ர", n: "ல", v: "வ", "/": "ழ", y: "ள",
	u: "ற", i: "ன",
	Q: "ஸ", W: "ஷ", E: "ஜ", R: "ஹ", T: "க்ஷ",
};

/** Independent vowel and the sign it becomes after a consonant. */
const VOWELS: Record<string, [string, string]> = {
	a: ["அ", ""], q: ["ஆ", "ா"], s: ["இ", "ி"], w: ["ஈ", "ீ"],
	d: ["உ", "ு"], e: ["ஊ", "ூ"], g: ["எ", "ெ"], t: ["ஏ", "ே"],
	r: ["ஐ", "ை"], c: ["ஒ", "ொ"], x: ["ஓ", "ோ"], z: ["ஔ", "ௌ"],
};

const OTHER: Record<string, string> = { F: "ஃ", Y: "ஸ்ரீ" };

/** Nasal → the stop that takes it as a cluster (ங்க, ஞ்ச, ண்ட, ந்த, ம்ப, ன்ற). */
const NASAL_STOP: Record<string, string> = {
	ங: "க", ஞ: "ச", ண: "ட", ந: "த", ம: "ப", ன: "ற",
};

/** The last letter of a consonant entry (க்ஷ ends in ஷ). */
const lastLetter = (c: string) => c[c.length - 1];

export function isTamil99Key(key: string): boolean {
	return key in CONSONANTS || key in VOWELS || key in OTHER || key === "f";
}

export function tamil99FromKeys({ keys }: { keys: string }): string {
	let out = "";
	// A consonant just typed, still taking its inherent "a".
	let bare: string | null = null;
	for (const key of keys) {
		const consonant = CONSONANTS[key];
		if (consonant) {
			const first = consonant[0];
			if (bare && (bare === first || NASAL_STOP[bare] === first)) out += PULLI;
			out += consonant;
			bare = lastLetter(consonant);
			continue;
		}
		const vowel = VOWELS[key];
		if (vowel) {
			out += bare ? vowel[1] : vowel[0];
			bare = null;
			continue;
		}
		if (key === "f") {
			if (bare) out += PULLI;
			bare = null;
			continue;
		}
		out += OTHER[key] ?? key;
		bare = null;
	}
	return out;
}
