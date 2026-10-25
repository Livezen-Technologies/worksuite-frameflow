import { describe, expect, test } from "bun:test";
import { SAMPLE_RATE, cleanText, looksHallucinated, planChunks, speechRegions, estimateConfidence, sinhalaShare } from "../segmenter";

/** Tone bursts (speech) separated by near-silence. */
function synth(parts: Array<[seconds: number, loud: boolean]>): Float32Array {
	const total = parts.reduce((s, [d]) => s + d, 0);
	const out = new Float32Array(Math.round(total * SAMPLE_RATE));
	let i = 0;
	for (const [d, loud] of parts) {
		const n = Math.round(d * SAMPLE_RATE);
		for (let k = 0; k < n; k++, i++) out[i] = loud ? 0.3 * Math.sin((2 * Math.PI * 220 * k) / SAMPLE_RATE) : (Math.random() - 0.5) * 0.002;
	}
	return out;
}

describe("segmenter", () => {
	test("finds speech between pauses with real timestamps", () => {
		const audio = synth([[1, false], [3, true], [1, false], [2, true], [2, false]]);
		const regions = speechRegions({ audio });
		expect(regions.length).toBe(2);
		expect(regions[0].start).toBeGreaterThan(0.9);
		expect(regions[0].start).toBeLessThan(1.1);
		expect(regions[1].start).toBeGreaterThan(4.9);
		expect(regions[1].end).toBeLessThan(7.2);
	});

	test("chunks stay within 15 s and keep their place in the audio", () => {
		const audio = synth([[0.5, false], [40, true], [1, false], [4, true], [0.5, false]]);
		const chunks = planChunks({ audio, regions: speechRegions({ audio }) });
		expect(chunks.length).toBeGreaterThan(2);
		for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(15.6);
		for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].start);
		expect(chunks[0].start).toBeGreaterThan(0.2);
	});

	test("cleanText removes loops and broken characters but keeps Sinhala conjuncts", () => {
		expect(cleanText("ඒම්! ඒම්! ඒම්! ඒම්! ඒම්! රීසියට?")).toBe("ඒම්! රීසියට?");
		expect(cleanText("ඒ�! යන්නෙ�")).toBe("ඒ! යන්නෙ");
		expect(cleanText("ශ්‍රී ලංකා")).toBe("ශ්‍රී ලංකා");
		expect(cleanText("Instagram and Facebook")).toBe("Instagram and Facebook");
		expect(cleanText("like this like this")).toBe("like this like this");
	});

	test("flags made-up text", () => {
		expect(looksHallucinated({ text: "ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්ම්", seconds: 5 })).toBe(true);
		expect(looksHallucinated({ text: "ඔයා කැමතිම social media app එක මොකක්ද?", seconds: 3 })).toBe(false);
	});
});

test("confidence drops for repeats, wrong script and odd speaking rate", () => {
	expect(estimateConfidence({ raw: "hello there my friend", text: "hello there my friend", seconds: 1.5 })).toBe(1);
	expect(estimateConfidence({ raw: "a a a a a a a a", text: "a", seconds: 3 })).toBeLessThan(0.7);
	expect(estimateConfidence({ raw: "hello", text: "hello", seconds: 1, language: "si" })).toBeLessThan(0.8);
	expect(sinhalaShare("මම ගෙදර යනවා")).toBe(1);
	expect(sinhalaShare("hello")).toBe(0);
});
