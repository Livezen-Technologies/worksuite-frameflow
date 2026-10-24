import { describe, expect, test } from "bun:test";
import { measureLoudness, truePeak } from "../loudness";

const RATE = 48000;
const sine = ({ freq, amp, seconds, phase = 0 }: { freq: number; amp: number; seconds: number; phase?: number }) => {
	const out = new Float32Array(RATE * seconds);
	for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE + phase);
	return out;
};

describe("BS.1770 loudness", () => {
	test("a 0 dBFS 997 Hz tone on one channel reads −3.01 LUFS", () => {
		const r = measureLoudness({ channels: [sine({ freq: 997, amp: 1, seconds: 5 }), new Float32Array(RATE * 5)], sampleRate: RATE });
		expect(r.integrated).toBeCloseTo(-3.01, 1);
	});
	test("stereo −20 dBFS 1 kHz reads about −20 LUFS with no range", () => {
		const ch = sine({ freq: 1000, amp: 0.1, seconds: 10 });
		const r = measureLoudness({ channels: [ch, ch], sampleRate: RATE });
		expect(Math.abs(r.integrated + 20)).toBeLessThan(0.15);
		expect(r.range).toBeLessThan(0.1);
	});
	test("silence is gated out", () => {
		const loud = sine({ freq: 1000, amp: 0.1, seconds: 5 });
		const both = new Float32Array(RATE * 15);
		both.set(loud, 0);
		const r = measureLoudness({ channels: [both, both], sampleRate: RATE });
		expect(Math.abs(r.integrated + 20)).toBeLessThan(0.3);
	});
	test("loudness range sees a quiet and a loud part", () => {
		const a = sine({ freq: 1000, amp: 0.1, seconds: 20 });
		const b = sine({ freq: 1000, amp: 0.01, seconds: 20 });
		const both = new Float32Array(a.length + b.length);
		both.set(a);
		both.set(b, a.length);
		const r = measureLoudness({ channels: [both, both], sampleRate: RATE });
		expect(r.range).toBeGreaterThan(18);
	});
	test("true peak finds the inter-sample peak of a fs/4 tone", () => {
		// Samples land at ±0.707 but the wave peaks at 1.0 (0 dBTP).
		const ch = sine({ freq: RATE / 4, amp: 1, seconds: 1, phase: Math.PI / 4 });
		expect(truePeak([ch])).toBeGreaterThan(-0.3);
	});
});
