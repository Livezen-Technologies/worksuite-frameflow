import { describe, expect, test } from "bun:test";
import { detectBeats } from "../beats";

describe("detectBeats", () => {
	test("finds clicks twice a second", () => {
		const sampleRate = 22050;
		const samples = new Float32Array(sampleRate * 4);
		for (let beat = 0.5; beat < 4; beat += 0.5) {
			const at = Math.round(beat * sampleRate);
			for (let i = 0; i < 800; i++) samples[at + i] = Math.sin(i / 3) * (1 - i / 800);
		}
		const beats = detectBeats({ samples, sampleRate });
		expect(beats.length).toBe(7);
		expect(Math.abs(beats[0]! - 0.5)).toBeLessThan(0.05);
	});

	test("silence has no beats", () => {
		expect(detectBeats({ samples: new Float32Array(44100), sampleRate: 44100 })).toEqual([]);
	});
});
