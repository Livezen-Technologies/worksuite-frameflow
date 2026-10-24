import { describe, expect, test } from "bun:test";
import { timeWords, voiceRevealWords } from "../voice-words";

describe("voice sync", () => {
	test("keeps spoken times for matching words", () => {
		const { words, matched } = timeWords({
			content: "hello world",
			spoken: [
				{ text: "Hello", start: 0.5, end: 0.9 },
				{ text: "world", start: 1.2, end: 1.6 },
			],
			durationSeconds: 3,
		});
		expect(matched).toBe(1);
		expect(words.map((w) => w.start)).toEqual([0.5, 1.2]);
	});

	test("spreads words over the clip when nothing was spoken", () => {
		const { words } = timeWords({ content: "a b", spoken: [], durationSeconds: 2 });
		expect(words[0]!.start).toBe(0);
		expect(words[1]!.start).toBe(1);
	});

	test("shows the words the voice has reached", () => {
		const words = [
			{ text: "a", start: 0.5, end: 1 },
			{ text: "b", start: 1.5, end: 2 },
		];
		expect(voiceRevealWords({ words, seconds: 0.2 })).toBe(0);
		expect(voiceRevealWords({ words, seconds: 1.6 })).toBe(2);
	});
});
