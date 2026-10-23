import { describe, expect, test } from "bun:test";
import { costFromUsage, estimateCost, formatUsd, pricesFor } from "../cost";

describe("AI cost estimates", () => {
	test("ten minutes of audio on Gemini Flash", () => {
		const estimate = estimateCost({
			size: { audioSeconds: 600, outputChars: 9000 },
			prices: pricesFor({ model: "gemini-2.5-flash" }),
		});
		expect(estimate.audioTokens).toBe(19200);
		// 19,200 audio tokens at $1/M plus ~2,300 output at $2.50/M.
		expect(estimate.usd).toBeGreaterThan(0.02);
		expect(estimate.usd).toBeLessThan(0.03);
	});

	test("unknown models are priced high so the cap still holds", () => {
		expect(pricesFor({ model: "mystery" }).output).toBe(10);
		expect(pricesFor({ model: "x", overrides: { x: { input: 1, audio: 1, output: 1 } } }).output).toBe(1);
	});

	test("real usage is costed from reported tokens", () => {
		const usd = costFromUsage({
			usage: { promptTokenCount: 1_000_000, candidatesTokenCount: 100_000 },
			prices: { input: 0.3, audio: 1, output: 2.5 },
			audioShare: 0.5,
		});
		expect(usd).toBeCloseTo(0.15 + 0.5 + 0.25);
		expect(formatUsd(0.004)).toBe("under $0.01");
		expect(formatUsd(0.25)).toBe("$0.250");
	});
});
