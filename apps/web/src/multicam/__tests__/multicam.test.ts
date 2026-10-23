import { describe, expect, test } from "bun:test";
import { buildSpans, cutTo, switchSpan } from "../cuts";
import { findOffset, onsetEnvelope, offsetsFromEnvelopes } from "../sync";
import { loudnessEnvelope, suggestCuts } from "../smart";
import type { MulticamGroup } from "../types";

const group = (angles: [number, number][]): MulticamGroup => ({
	id: "g",
	name: "Shoot",
	angles: angles.map(([offset, duration], i) => ({
		mediaId: `m${i}`,
		name: `Cam ${i + 1}`,
		offset,
		duration,
	})),
	audio: "follow",
	length: Math.max(...angles.map(([o, d]) => o + d)),
	sync: "audio",
});

/** Noise bursts at the given seconds, like claps. */
function claps({
	seconds,
	at,
	rate = 8000,
}: {
	seconds: number;
	at: number[];
	rate?: number;
}) {
	const s = new Float32Array(seconds * rate);
	let seed = 1;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
	for (let i = 0; i < s.length; i++) s[i] = rnd() * 0.01;
	for (const t of at)
		for (let i = 0; i < rate * 0.05; i++)
			s[Math.floor(t * rate) + i] = rnd() * 0.9;
	return s;
}

describe("multicam cuts", () => {
	test("spans follow the cuts and merge same-angle neighbours", () => {
		const g = group([
			[0, 10],
			[0, 10],
		]);
		expect(
			buildSpans({
				group: g,
				cuts: [
					{ at: 0, angle: 0 },
					{ at: 4, angle: 1 },
					{ at: 6, angle: 1 },
				],
			}),
		).toEqual([
			{ start: 0, end: 4, angle: 0 },
			{ start: 4, end: 10, angle: 1 },
		]);
	});

	test("an angle without picture is filled by one that has it", () => {
		// Cam 2 starts at 3 s; cutting to it at 1 s shows cam 1 until 3 s.
		const g = group([
			[0, 10],
			[3, 7],
		]);
		expect(buildSpans({ group: g, cuts: [{ at: 1, angle: 1 }] })).toEqual([
			{ start: 0, end: 3, angle: 0 },
			{ start: 3, end: 10, angle: 1 },
		]);
	});

	test("live cut replaces later cuts; switching one span keeps the rest", () => {
		expect(
			cutTo({
				cuts: [
					{ at: 0, angle: 0 },
					{ at: 5, angle: 2 },
				],
				at: 3,
				angle: 1,
			}),
		).toEqual([
			{ at: 0, angle: 0 },
			{ at: 3, angle: 1 },
		]);
		const spans = [
			{ start: 0, end: 4, angle: 0 },
			{ start: 4, end: 8, angle: 1 },
		];
		expect(switchSpan({ spans, at: 5, angle: 2 })).toEqual([
			{ at: 0, angle: 0 },
			{ at: 4, angle: 2 },
		]);
	});
});

describe("audio sync", () => {
	test("finds a 2.37 s offset from claps", () => {
		const a = claps({ seconds: 20, at: [3, 7.5, 12, 15.2] });
		// Camera B started 2.37 s later, so each clap comes 2.37 s earlier in its file.
		const b = claps({
			seconds: 20,
			at: [3 - 2.37, 7.5 - 2.37, 12 - 2.37, 15.2 - 2.37],
		});
		const ea = onsetEnvelope({ samples: a, sampleRate: 8000 });
		const eb = onsetEnvelope({ samples: b, sampleRate: 8000 });
		const { offset, confidence } = findOffset({ reference: ea, other: eb });
		expect(offset).toBeCloseTo(2.37, 1);
		expect(confidence).toBeGreaterThan(0.3);
		const { offsets } = offsetsFromEnvelopes({ envelopes: [ea, eb] });
		expect(offsets[0]).toBe(0);
		expect(offsets[1]).toBeCloseTo(2.37, 1);
	});
});

describe("smart switching", () => {
	test("cuts to whoever is talking and holds shots", () => {
		const rate = 8000;
		const a = new Float32Array(10 * rate);
		const b = new Float32Array(10 * rate);
		// A talks 0–5 s, B talks 5–10 s.
		for (let i = 0; i < a.length; i++) {
			const t = i / rate;
			a[i] = (t < 5 ? 0.5 : 0.01) * Math.sin(i / 7);
			b[i] = (t >= 5 ? 0.5 : 0.01) * Math.sin(i / 5);
		}
		const g = group([
			[0, 10],
			[0, 10],
		]);
		const cuts = suggestCuts({
			group: g,
			loudness: [a, b].map((s) =>
				loudnessEnvelope({ samples: s, sampleRate: rate }),
			),
			rate: 20,
		});
		expect(cuts[0]).toEqual({ at: 0, angle: 0 });
		expect(cuts[1].angle).toBe(1);
		expect(cuts[1].at).toBeGreaterThanOrEqual(4.5);
		expect(cuts[1].at).toBeLessThanOrEqual(5.5);
	});
});
