import { describe, expect, test } from "bun:test";
import { applyTextResults, buildTranslateRequest } from "../prompts";
import { correctionsIn, examplesFor, mergeEntries, type MemoryEntry } from "../translation-memory";
import type { Transcript } from "@/transcript/types";

const source: Transcript = {
	version: 1,
	language: "en",
	engine: "Local Whisper",
	createdAt: 0,
	segments: [
		{ id: "a", start: 0, end: 2, text: "Welcome to the show", lang: "en", verified: true },
		{ id: "b", start: 2, end: 4, text: "See you soon", lang: "en", verified: true },
	],
};

describe("translation memory (AI-37)", () => {
	const translated = applyTextResults({
		transcript: source,
		results: new Map([["a", "සංදර්ශනයට සාදරයෙන් පිළිගනිමු"], ["b", "ඉක්මනින් හමුවෙමු"]]),
		language: "si",
		translatedTo: "si",
	}).transcript;

	test("translation keeps the source of each segment", () => {
		expect(translated.segments[0].translation).toEqual({
			source: "Welcome to the show",
			machine: "සංදර්ශනයට සාදරයෙන් පිළිගනිමු",
			target: "si",
		});
	});

	test("only segments the user changed become corrections", () => {
		expect(correctionsIn({ transcript: translated, projectId: "p", at: 1 })).toEqual([]);
		const edited = {
			...translated,
			segments: translated.segments.map((s) => (s.id === "a" ? { ...s, text: "වැඩසටහනට සාදරයෙන් පිළිගනිමු" } : s)),
		};
		expect(correctionsIn({ transcript: edited, projectId: "p", at: 1 })).toEqual([
			{ source: "Welcome to the show", corrected: "වැඩසටහනට සාදරයෙන් පිළිගනිමු", target: "si", projectId: "p", at: 1 },
		]);
	});

	test("clean-up drops the machine record so its edits aren't counted", () => {
		const cleaned = applyTextResults({ transcript: translated, results: new Map([["a", "x"]]) }).transcript;
		expect(cleaned.segments[0].translation).toBeUndefined();
		expect(cleaned.segments[1].translation).toBeDefined();
	});

	const entry = (over: Partial<MemoryEntry>): MemoryEntry => ({
		source: "s", corrected: "c", target: "si", projectId: "p", at: 0, ...over,
	});

	test("a newer correction of the same source replaces the old one", () => {
		const first = mergeEntries({ entries: [], added: [entry({ corrected: "one" })] });
		const second = mergeEntries({ entries: first, added: [entry({ corrected: "two" })] });
		expect(second).toEqual([entry({ corrected: "two" })]);
		expect(mergeEntries({ entries: second, added: [entry({ corrected: "two" })] })).toBe(second);
	});

	test("examples: same language, this project first, then shared words", () => {
		const entries = [
			entry({ source: "unrelated line", projectId: "other" }),
			entry({ source: "welcome everyone to the show", projectId: "other" }),
			entry({ source: "goodbye", projectId: "p" }),
			entry({ source: "welcome", target: "ta", projectId: "p" }),
		];
		const got = examplesFor({ entries, target: "si", projectId: "p", texts: ["Welcome to the show"] });
		expect(got.map((e) => e.source)).toEqual(["goodbye", "welcome everyone to the show", "unrelated line"]);
		expect(examplesFor({ entries, target: "si", projectId: "p", texts: [], limit: 1 })).toHaveLength(1);
	});

	test("examples are sent to Gemini with the translate request", () => {
		const req = buildTranslateRequest({
			segments: source.segments,
			target: "si",
			vocabulary: [],
			examples: [{ source: "See you", corrected: "හමුවෙමු" }],
		});
		expect(req.system).toContain('"original":"See you","translation":"හමුවෙමු"');
		expect(buildTranslateRequest({ segments: source.segments, target: "si", vocabulary: [] }).system).not.toContain("corrected earlier");
	});
});
