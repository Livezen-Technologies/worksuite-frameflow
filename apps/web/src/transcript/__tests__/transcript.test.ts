import { describe, expect, test } from "bun:test";
import { buildCuesFromTranscript, breakLines } from "../cues";
import { exportTranscript, importTranscript } from "../format";
import { detectScriptLanguage } from "../script";
import {
	createTranscript,
	graphemes,
	mergeWithNext,
	replaceAll,
	snapToGraphemeBoundary,
	splitSegment,
	toggleVerified,
	updateSegmentText,
} from "../transcript";

const SI = "අද අපි Worksuite Cloud ගැන කතා කරමු.";

function sample() {
	return createTranscript({
		language: "si",
		engine: "Local Whisper",
		segments: [
			{ text: " ආයුබෝවන්, සියලු දෙනාටම. ", start: 0, end: 2.5 },
			{ text: SI, start: 2.5, end: 6 },
			{ text: "Thanks for watching", start: 6, end: 8 },
		],
	});
}

describe("script detection", () => {
	test("tags Sinhala, English and mixed text", () => {
		expect(detectScriptLanguage("ආයුබෝවන්")).toBe("si");
		expect(detectScriptLanguage("Hello there")).toBe("en");
		expect(detectScriptLanguage(SI)).toBe("mixed");
		expect(detectScriptLanguage("123 ...")).toBe("other");
	});

	test("createTranscript trims text and tags each segment", () => {
		const t = sample();
		expect(t.segments.map((s) => s.lang)).toEqual(["si", "mixed", "en"]);
		expect(t.segments[0].text).toBe("ආයුබෝවන්, සියලු දෙනාටම.");
		expect(t.segments.every((s) => !s.verified)).toBe(true);
	});
});

describe("editing", () => {
	test("text edits re-tag the language", () => {
		const t = sample();
		const next = updateSegmentText({
			transcript: t,
			id: t.segments[2].id,
			text: "ස්තූතියි",
		});
		expect(next.segments[2].lang).toBe("si");
	});

	test("split never cuts inside a Sinhala cluster", () => {
		const word = "ස්තූතියි"; // conjunct with virama + vowel signs
		for (let offset = 0; offset <= word.length; offset++) {
			const cut = snapToGraphemeBoundary({ text: word, offset });
			const boundaries = graphemes(word).reduce<number[]>(
				(acc, g) => [...acc, (acc.at(-1) ?? 0) + g.length],
				[0],
			);
			expect(boundaries).toContain(cut);
		}
	});

	test("split shares time by text length and merge undoes it", () => {
		const t = sample();
		const seg = t.segments[2]; // "Thanks for watching" 6..8
		const split = splitSegment({ transcript: t, id: seg.id, offset: 6 });
		expect(split.segments).toHaveLength(4);
		expect(split.segments[2].text).toBe("Thanks");
		expect(split.segments[3].text).toBe("for watching");
		expect(split.segments[2].end).toBeCloseTo(6 + 2 * (6 / 19), 5);
		const merged = mergeWithNext({
			transcript: split,
			id: split.segments[2].id,
		});
		expect(merged.segments).toHaveLength(3);
		expect(merged.segments[2].text).toBe("Thanks for watching");
		expect(merged.segments[2].end).toBe(8);
	});

	test("replaceAll is literal and verify toggles", () => {
		const t = replaceAll({
			transcript: sample(),
			find: "Worksuite Cloud",
			replace: "FrameFlow",
		});
		expect(t.segments[1].text).toContain("FrameFlow");
		const v = toggleVerified({ transcript: t, id: t.segments[0].id });
		expect(v.segments[0].verified).toBe(true);
		expect(
			replaceAll({ transcript: t, find: ".", replace: "!" }).segments[0].text,
		).toBe("ආයුබෝවන්, සියලු දෙනාටම!");
	});
});

describe("subtitle cues", () => {
	test("lines stay within 42 clusters and keep clusters whole", () => {
		const long = Array(12).fill("ස්තූතියි").join(" ");
		const lines = breakLines({ text: long });
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(graphemes(line).length).toBeLessThanOrEqual(42);
			expect(line.normalize()).toBe(line);
		}
		expect(lines.join(" ")).toBe(long);
	});

	test("an over-long word is broken between clusters only", () => {
		const word = "ස්තූ".repeat(30);
		const lines = breakLines({ text: word, maxGraphemes: 10 });
		expect(lines.join("")).toBe(word);
		for (const line of lines)
			expect(graphemes(line).length).toBeLessThanOrEqual(10);
	});

	test("cues have at most 2 lines, 1–7 s, no overlap, inside segments", () => {
		const t = createTranscript({
			language: "si",
			engine: "test",
			segments: [
				{ text: Array(40).fill("කතා").join(" "), start: 0, end: 30 },
				{ text: "ok", start: 30, end: 30.2 },
			],
		});
		const cues = buildCuesFromTranscript({ transcript: t });
		let previousEnd = 0;
		for (const cue of cues) {
			expect(cue.text.split("\n").length).toBeLessThanOrEqual(2);
			expect(cue.duration).toBeLessThanOrEqual(7);
			expect(cue.startTime).toBeGreaterThanOrEqual(previousEnd - 1e-9);
			previousEnd = cue.startTime + cue.duration;
		}
		expect(cues[0].duration).toBeGreaterThanOrEqual(1);
		expect(cues.at(-1)!.text).toBe("ok");
		expect(cues.at(-1)!.startTime).toBeGreaterThanOrEqual(30);
	});
});

describe("import / export", () => {
	test("SRT and VTT round-trip text and times", () => {
		const t = sample();
		for (const format of ["srt", "vtt"] as const) {
			const { content } = exportTranscript({ transcript: t, format });
			const back = importTranscript({
				fileName: `x.${format}`,
				input: content,
				current: null,
			});
			expect(back.segments.map((s) => s.text)).toEqual(
				t.segments.map((s) => s.text),
			);
			expect(back.segments.map((s) => s.start)).toEqual(
				t.segments.map((s) => s.start),
			);
			expect(back.segments.map((s) => s.end)).toEqual(
				t.segments.map((s) => s.end),
			);
		}
	});

	test("VTT with short timestamps and settings imports", () => {
		const vtt =
			"WEBVTT\n\nNOTE hi\n\n00:01.000 --> 00:02.500 align:start\nආයුබෝවන්\n";
		const t = importTranscript({
			fileName: "a.vtt",
			input: vtt,
			current: null,
		});
		expect(t.segments).toHaveLength(1);
		expect(t.segments[0].start).toBe(1);
		expect(t.segments[0].end).toBe(2.5);
	});

	test("JSON round-trips; TXT replaces text line by line", () => {
		const t = sample();
		const json = importTranscript({
			fileName: "t.json",
			input: exportTranscript({ transcript: t, format: "json" }).content,
			current: null,
		});
		expect(json.segments.map((s) => s.text)).toEqual(
			t.segments.map((s) => s.text),
		);
		const txt = importTranscript({
			fileName: "t.txt",
			input: "එක\nදෙක\nthree\n",
			current: t,
		});
		expect(txt.segments.map((s) => s.text)).toEqual(["එක", "දෙක", "three"]);
		expect(txt.segments[1].start).toBe(2.5);
		expect(() =>
			importTranscript({ fileName: "t.txt", input: "one\n", current: t }),
		).toThrow();
		expect(() =>
			importTranscript({ fileName: "t.json", input: "{}", current: null }),
		).toThrow();
	});
});
