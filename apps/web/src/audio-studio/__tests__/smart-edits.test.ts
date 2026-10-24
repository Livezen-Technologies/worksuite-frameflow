import { describe, expect, test } from "bun:test";
import type { Transcript } from "@/transcript/types";
import { duckKeyframes, fillerRanges, mergeIntervals, speechIntervals } from "../smart-edits";

const transcript = (words: [string, number, number][]): Transcript => ({
	version: 1,
	language: "en",
	engine: "test",
	createdAt: 0,
	segments: [{ id: "s", start: 0, end: 10, text: words.map((w) => w[0]).join(" "), lang: "en", verified: false, words: words.map(([text, start, end]) => ({ text, start, end })) }],
});

describe("filler words", () => {
	test("finds um, uh and Sinhala ම්, ignoring case and punctuation, and merges neighbours", () => {
		const t = transcript([["So,", 0, 0.4], ["Um,", 0.5, 0.8], ["uh", 0.82, 1.0], ["we", 1.1, 1.3], ["ම්", 2.0, 2.3], ["start.", 2.4, 2.9]]);
		const r = fillerRanges({ transcript: t, pad: 0.03 });
		expect(r.map((x) => [x.start, x.end].map((n) => Math.round(n * 100) / 100))).toEqual([[0.47, 1.03], [1.97, 2.33]]);
	});
	test("nothing to remove without fillers", () => {
		expect(fillerRanges({ transcript: transcript([["hello", 0, 1]]) })).toEqual([]);
	});
});

describe("ducking", () => {
	test("speech intervals bridge short gaps and drop blips", () => {
		const rms = [0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
		expect(speechIntervals({ rms, hop: 0.1, threshold: 0.5, hold: 0.15, minLength: 0.15 })).toEqual([{ start: 0.1, end: 0.6 }]);
	});
	test("intervals merge across a gap", () => {
		expect(mergeIntervals({ intervals: [{ start: 3, end: 4 }, { start: 1, end: 2 }, { start: 2.3, end: 2.5 }], gap: 0.4 })).toEqual([
			{ start: 1, end: 2.5 },
			{ start: 3, end: 4 },
		]);
	});
	test("keyframes dip under each phrase, relative to the clip", () => {
		const keys = duckKeyframes({ speech: [{ start: 12, end: 14 }], clipStart: 10, clipDuration: 20, base: 0, depth: 12, attack: 0.2, release: 0.5 });
		expect(keys).toEqual([
			{ time: 1.8, value: 0 },
			{ time: 2, value: -12 },
			{ time: 4, value: -12 },
			{ time: 4.5, value: 0 },
		]);
	});
	test("phrases close together stay ducked, and speech outside the clip is ignored", () => {
		const keys = duckKeyframes({ speech: [{ start: 1, end: 2 }, { start: 2.4, end: 3 }, { start: 50, end: 51 }], clipStart: 0, clipDuration: 10, base: -3, depth: 10, attack: 0.1, release: 0.5 });
		expect(keys.map((k) => k.value)).toEqual([-3, -13, -13, -3]);
		expect(keys[2]!.time).toBe(3);
	});
});
