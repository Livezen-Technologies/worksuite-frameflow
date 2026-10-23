import { describe, expect, test } from "bun:test";
import {
	duckKeys,
	levellingGain,
	silencePlan,
	spectralGate,
	speechLoudness,
	speechRanges,
	toDb,
} from "../dsp";

const rate = 16000;
/** Noise everywhere, a 300 Hz "voice" in the given ranges. */
function take({
	seconds,
	voice,
}: {
	seconds: number;
	voice: [number, number][];
}) {
	const s = new Float32Array(seconds * rate);
	let seed = 1;
	for (let i = 0; i < s.length; i++) {
		seed = (seed * 16807) % 2147483647;
		const t = i / rate;
		const noise = ((seed / 2147483647) * 2 - 1) * 0.01;
		const on = voice.some(([a, b]) => t >= a && t < b);
		s[i] = noise + (on ? 0.3 * Math.sin(2 * Math.PI * 300 * t) : 0);
	}
	return s;
}
const rms = (s: Float32Array) =>
	toDb(Math.sqrt(s.reduce((n, v) => n + v * v, 0) / s.length));

describe("voice tools", () => {
	const samples = take({
		seconds: 8,
		voice: [
			[1, 2.5],
			[2.7, 3.5],
			[6, 7],
		],
	});

	test("finds speech, joining short gaps", () => {
		const ranges = speechRanges({ samples, sampleRate: rate });
		expect(ranges).toHaveLength(2);
		expect(ranges[0]![0]).toBeCloseTo(1, 1);
		expect(ranges[0]![1]).toBeCloseTo(3.5, 1);
		expect(ranges[1]![0]).toBeCloseTo(6, 1);
	});

	test("silence trim drops the ends and shortens the long pause", () => {
		const keep = silencePlan({
			speech: [
				[1, 3.5],
				[6, 7],
			],
			duration: 8,
		});
		expect(keep[0]![0]).toBeCloseTo(0.85);
		expect(keep[1]![1]).toBeCloseTo(7.15);
		// The 2.5 s pause becomes 0.4 s.
		const kept = keep.reduce((n, [a, b]) => n + b - a, 0);
		expect(kept).toBeCloseTo(2.5 + 0.4 + 1 + 0.15 + 0.15, 1);
	});

	test("noise reduction lowers the noise, keeps the voice", () => {
		const cleaned = spectralGate({ samples, sampleRate: rate });
		const quiet = (s: Float32Array) => s.subarray(4 * rate, 5.5 * rate);
		const voiced = (s: Float32Array) => s.subarray(1.2 * rate, 2.2 * rate);
		expect(rms(quiet(cleaned))).toBeLessThan(rms(quiet(samples)) - 8);
		expect(Math.abs(rms(voiced(cleaned)) - rms(voiced(samples)))).toBeLessThan(
			1.5,
		);
	});

	test("levelling brings speech to about -16", () => {
		const gain = levellingGain({ samples, sampleRate: rate });
		const louder = samples.map((v) => v * 10 ** (gain / 20));
		expect(speechLoudness({ samples: louder, sampleRate: rate })).toBeCloseTo(
			-16,
			0,
		);
	});

	test("ducking ramps down under speech and back up", () => {
		const keys = duckKeys({
			speech: [
				[1, 2],
				[2.3, 3],
				[6, 7],
			],
		});
		expect(keys.map((k) => k.db)).toEqual([0, -12, -12, 0, 0, -12, -12, 0]);
		expect(keys[0]!.time).toBeCloseTo(0.7);
		expect(keys[3]!.time).toBeCloseTo(3.7);
	});
});
