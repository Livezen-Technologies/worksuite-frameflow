import { describe, expect, test } from "bun:test";
import {
	applyTextResults,
	batches,
	buildCleanupRequest,
	buildTranslateRequest,
	parseTextResults,
	parseTranscribeResult,
} from "../prompts";
import { encodeWav, splitAtPauses } from "../audio";
import type { Transcript } from "@/transcript/types";

const transcript: Transcript = {
	version: 1,
	language: "en",
	engine: "Local Whisper",
	createdAt: 0,
	segments: [
		{
			id: "a",
			start: 0,
			end: 2,
			text: "helo world",
			lang: "en",
			verified: true,
		},
		{
			id: "b",
			start: 2,
			end: 4,
			text: "um this is it",
			lang: "en",
			verified: true,
		},
	],
};

describe("AI prompts", () => {
	test("requests name the language, vocabulary and keep ids", () => {
		const t = buildTranslateRequest({
			segments: transcript.segments,
			target: "si",
			vocabulary: ["Worksuite"],
		});
		expect(t.system).toContain("Sinhala");
		expect(t.system).toContain("Worksuite");
		expect(JSON.parse(t.text)).toEqual([
			{ id: "a", text: "helo world" },
			{ id: "b", text: "um this is it" },
		]);
		expect(
			buildCleanupRequest({
				segments: [],
				language: "en",
				removeFillers: true,
				vocabulary: [],
			}).system,
		).toContain("Remove filler");
	});

	test("results are applied by id; junk and unknown ids are ignored", () => {
		const results = parseTextResults(
			'```json\n{"segments":[{"id":"a","text":"Hello world."},{"id":"zzz","text":"x"},{"id":"b","text":"  "},{"text":"no id"}]}\n```',
		);
		expect([...results]).toEqual([
			["a", "Hello world."],
			["zzz", "x"],
		]);
		const { transcript: next, changed } = applyTextResults({
			transcript,
			results,
		});
		expect(changed).toBe(1);
		expect(next.segments[0]).toMatchObject({
			text: "Hello world.",
			verified: false,
			start: 0,
			end: 2,
		});
		expect(next.segments[1]).toBe(transcript.segments[1]);
		expect(parseTextResults("not json").size).toBe(0);
	});

	test("batches", () => {
		expect(batches({ items: [1, 2, 3, 4, 5], size: 2 })).toEqual([
			[1, 2],
			[3, 4],
			[5],
		]);
	});

	test("transcription results are offset, clamped and sorted", () => {
		const segments = parseTranscribeResult({
			text: '{"segments":[{"start":5,"end":9,"text":"second"},{"start":-1,"end":2,"text":"first"},{"start":"x","end":1,"text":"bad"},{"start":9.9,"end":30,"text":"tail"}]}',
			offset: 100,
			duration: 10,
		});
		expect(segments.map((s) => s.text)).toEqual(["first", "second", "tail"]);
		expect(segments[0]).toEqual({ text: "first", start: 100, end: 102 });
		expect(segments[2].end).toBe(110);
	});
});

describe("AI audio", () => {
	test("WAV header and size", () => {
		const wav = encodeWav({
			samples: new Float32Array([0, 1, -1]),
			sampleRate: 16000,
		});
		const view = new DataView(wav);
		expect(wav.byteLength).toBe(50);
		expect(String.fromCharCode(...new Uint8Array(wav, 0, 4))).toBe("RIFF");
		expect(view.getUint32(24, true)).toBe(16000);
		expect(view.getInt16(46, true)).toBe(32767);
	});

	test("chunks cut at the quietest moment and cover everything", () => {
		const rate = 100;
		const samples = new Float32Array(rate * 50).fill(0.5);
		samples.fill(0, 17 * rate, 17 * rate + 10); // a pause at 17 s
		const chunks = splitAtPauses({ samples, sampleRate: rate, seconds: 20 });
		expect(chunks[0].start).toBe(0);
		expect(Math.abs(chunks[0].end - 17 * rate)).toBeLessThanOrEqual(5);
		expect(chunks.at(-1)?.end).toBe(samples.length);
		for (let i = 1; i < chunks.length; i++)
			expect(chunks[i].start).toBe(chunks[i - 1].end);
	});
});
