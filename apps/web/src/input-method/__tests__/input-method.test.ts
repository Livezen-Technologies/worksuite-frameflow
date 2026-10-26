import { describe, expect, test } from "bun:test";
import { suggest } from "../candidates";
import {
	isLegacyFont,
	legacyToUnicode,
	looksLikeLegacy,
	unicodeToLegacy,
} from "../legacy";
import { convertSinglishText, singlishToSinhala, sinhalaToSinglish } from "../sinhala";
import { tamilPhonetic } from "../tamil";

describe("Singlish", () => {
	test("vowels, virama and conjuncts", () => {
		expect(singlishToSinhala({ text: "mama" })).toBe("මම");
		expect(singlishToSinhala({ text: "oyaa" })).toBe("ඔයා");
		expect(singlishToSinhala({ text: "kriyaa" })).toBe("ක්‍රියා");
		expect(singlishToSinhala({ text: "vidyaa" })).toBe("විඩ්‍යා");
		expect(singlishToSinhala({ text: "karma" })).toBe("කර්‍ම");
		expect(singlishToSinhala({ text: "langkaa" })).toBe("ලංකා");
	});
	test("dictionary-ranked candidates", () => {
		expect(suggest({ latin: "ayubowan", language: "si" })[0]).toBe("ආයුබෝවන්");
		expect(suggest({ latin: "sthuthiyi", language: "si" })[0]).toBe("ස්තූතියි");
		const kalaya = suggest({ latin: "kalaya", language: "si" });
		expect(kalaya.length).toBeGreaterThanOrEqual(3);
		expect(kalaya).toContain("කාලය");
		expect(kalaya).toContain("කලය");
	});
	test("learned picks come first", () => {
		const learned = { kalaya: { "කලය": 3 } };
		expect(suggest({ latin: "kalaya", language: "si", learned })[0]).toBe("කලය");
	});
	test("bulk conversion keeps backtick English", () => {
		expect(convertSinglishText({ text: "mama `YouTube` channel" })).toBe(
			"මම YouTube චන්නෙල්",
		);
	});
	test("romanises Sinhala", () => {
		expect(sinhalaToSinglish({ text: "ආයුබෝවන්" })).toBe("aayubowan");
	});
});

describe("Tamil", () => {
	test("phonetic typing", () => {
		expect(tamilPhonetic({ text: "nanri" })).toBe("நன்ரி");
		expect(suggest({ latin: "vanakkam", language: "ta" })[0]).toBe("வணக்கம்");
	});
});

describe("legacy fonts", () => {
	const SAMPLE = [
		"විද්‍යාලය",
		"ශ්‍රී ලංකා",
		"කෝපි",
		"පොත",
		"ගෙදර",
		"මෛත්‍රී",
		"කර්‍මය",
		"ආයුබෝවන්",
		"ප්‍රවෘත්ති",
		"සෞඛ්‍යය",
		"ක්‍රීඩාව",
		"සේවය",
	];
	test("round-trips conjuncts and vowel signs", () => {
		for (const word of SAMPLE)
			expect(legacyToUnicode({ text: unicodeToLegacy({ text: word }) })).toBe(word);
	});
	test("known FM spellings", () => {
		expect(unicodeToLegacy({ text: "විද්‍යාලය" })).toBe("jsoHd,h");
		expect(unicodeToLegacy({ text: "ගෙදර" })).toBe("f.or");
	});
	test("detects legacy paste but not English", () => {
		expect(looksLikeLegacy({ text: "jsoHd,h f.or" })).toBe(true);
		expect(looksLikeLegacy({ text: "hello world this is english" })).toBe(false);
		expect(looksLikeLegacy({ text: "මම" })).toBe(false);
	});
	test("recognises legacy font names", () => {
		expect(isLegacyFont({ fontFamily: "FM Abhaya" })).toBe(true);
		expect(isLegacyFont({ fontFamily: "DL-Manel-bold" })).toBe(true);
		expect(isLegacyFont({ fontFamily: "Noto Sans Sinhala" })).toBe(false);
	});
});

describe("Tamil99 (TI-05)", () => {
	test("consonant + vowel keys make syllables", async () => {
		const { tamil99FromKeys } = await import("../tamil99");
		// வணக்கம்: v a p h h k f
		expect(tamil99FromKeys({ keys: "vaphhkf" })).toBe("வணக்கம்");
		// நன்றி: ; a i u s
		expect(tamil99FromKeys({ keys: ";aius" })).toBe("நன்றி");
		// தமிழ்: l a k s / f
		expect(tamil99FromKeys({ keys: "laks/f" })).toBe("தமிழ்");
		// அம்மா: a k k q
		expect(tamil99FromKeys({ keys: "akkq" })).toBe("அம்மா");
		// இந்தியா: s ; l s ' q
		expect(tamil99FromKeys({ keys: "s;ls'q" })).toBe("இந்தியா");
		// ஸ்ரீ and ஃ
		expect(tamil99FromKeys({ keys: "YF" })).toBe("ஸ்ரீஃ");
	});
});

describe("next-word suggestions (TI-12)", () => {
	test("most frequent followers first", async () => {
		const { nextWordSuggestions, wordBefore } = await import("../candidates");
		const nextWords = { මම: { යනවා: 3, කනවා: 1, එනවා: 2 } };
		expect(nextWordSuggestions({ previous: "මම", nextWords })).toEqual(["යනවා", "එනවා", "කනවා"]);
		expect(nextWordSuggestions({ previous: "ඔබ", nextWords })).toEqual([]);
		expect(wordBefore({ text: "අද මම ", at: 6 })).toBe("මම");
		expect(wordBefore({ text: "", at: 0 })).toBe("");
	});
});

describe("spell check (TI-13)", () => {
	test("finds unknown words and suggests close ones", async () => {
		const { findMisspellings, editDistance, languageOf } = await import("../spell");
		const { isDictionaryWord } = await import("../candidates");
		expect(editDistance({ a: "ගෙදර", b: "ගෙදර", max: 2 })).toBe(0);
		expect(editDistance({ a: "ගෙදර", b: "ගදර", max: 2 })).toBe(1);
		const isKnown = (word: string) => isDictionaryWord({ language: "si", word });
		// "ගෙදරර" is a slip for ගෙදර (home).
		const found = findMisspellings({ text: "මම ගෙදරර යනවා", language: "si", isKnown });
		expect(found.map((m) => m.word)).toEqual(["ගෙදරර"]);
		expect(found[0].start).toBe(3);
		expect(found[0].suggestions[0]).toBe("ගෙදර");
		expect(languageOf("வணக்கம் hello")).toBe("ta");
		expect(languageOf("hello")).toBeNull();
	});
});

test("links and email addresses are never taken for legacy Sinhala", () => {
	expect(looksLikeLegacy({ text: "https://www.adaderana.lk/news.php?nid=123" })).toBe(false);
	expect(looksLikeLegacy({ text: "someone@example.com" })).toBe(false);
});
