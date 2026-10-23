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
