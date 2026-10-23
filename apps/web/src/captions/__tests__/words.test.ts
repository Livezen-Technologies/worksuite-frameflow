import { describe, expect, test } from "bun:test";
import { estimateWords, groupWords, realignWords, wordIndexAt } from "../words";

const timed = [
	{ text: "hello", start: 0, end: 0.4 },
	{ text: "um", start: 0.5, end: 0.7 },
	{ text: "big", start: 0.8, end: 1.0 },
	{ text: "world.", start: 1.1, end: 1.6 },
];

describe("word timing", () => {
	test("re-aligns rewritten text, keeping real times where words match", () => {
		const { words, matched } = realignWords({ words: timed, text: "Hello big wide world" });
		expect(words.map((w) => w.text)).toEqual(["Hello", "big", "wide", "world"]);
		expect(words[0]).toMatchObject({ start: 0, end: 0.4 });
		expect(words[1]).toMatchObject({ start: 0.8, end: 1.0 });
		// "wide" sits in the gap between "big" and "world".
		expect(words[2]!.start).toBeCloseTo(1.0);
		expect(words[2]!.end).toBeCloseTo(1.1);
		expect(words[3]).toMatchObject({ start: 1.1, end: 1.6 });
		expect(matched).toBeCloseTo(0.75);
	});

	test("a translation shares the whole span by length", () => {
		const { words, matched } = realignWords({ words: timed, text: "ආයුබෝවන් ලෝකය" });
		expect(matched).toBe(0);
		expect(words[0]!.start).toBe(0);
		expect(words[1]!.end).toBeCloseTo(1.6);
	});

	test("finds the spoken word and holds it through short gaps", () => {
		expect(wordIndexAt({ words: timed, seconds: 0.45 })).toBe(0);
		expect(wordIndexAt({ words: timed, seconds: 1.2 })).toBe(3);
		expect(wordIndexAt({ words: timed, seconds: 2 })).toBe(-1);
	});

	test("groups model words at pauses and sentence ends", () => {
		const groups = groupWords({
			words: [...timed, { text: "Next", start: 3, end: 3.3 }, { text: "one", start: 3.3, end: 3.6 }],
		});
		expect(groups.map((g) => g.text)).toEqual(["hello um big world.", "Next one"]);
		expect(groups[1]).toMatchObject({ start: 3, end: 3.6 });
	});

	test("estimates by length", () => {
		const words = estimateWords({ text: "a bbb", start: 0, end: 4 });
		expect(words[0]).toMatchObject({ start: 0, end: 1 });
		expect(words[1]).toMatchObject({ start: 1, end: 4 });
	});
});
