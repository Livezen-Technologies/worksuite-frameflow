import { describe, expect, test } from "bun:test";
import { cutTranscriptRange } from "../transcript";
import type { Transcript } from "../types";

const t: Transcript = {
	version: 1,
	language: "si",
	engine: "test",
	createdAt: 0,
	segments: [
		{
			id: "1",
			start: 0,
			end: 2,
			text: "ආයුබෝවන්",
			lang: "si",
			verified: false,
		},
		{ id: "2", start: 2, end: 5, text: "cut me", lang: "en", verified: false },
		{ id: "3", start: 5, end: 8, text: "after", lang: "en", verified: false },
	],
};

describe("cutTranscriptRange", () => {
	test("drops the cut line and moves later lines earlier", () => {
		const out = cutTranscriptRange({ transcript: t, start: 2, end: 5 });
		expect(out.segments.map((s) => s.id)).toEqual(["1", "3"]);
		expect(out.segments[1]).toMatchObject({ start: 2, end: 5 });
	});
});
