import { describe, expect, test } from "bun:test";
import { estimateExportSeconds, formatEstimate } from "../time-estimate";

describe("export time estimate", () => {
	test("scales with frames, size and AI extra time", () => {
		const base = estimateExportSeconds({ msPerFrame: 20, frames: 1800, pixelRatio: 1 });
		expect(base).toBeCloseTo(57.6);
		const big = estimateExportSeconds({ msPerFrame: 20, frames: 1800, pixelRatio: 4 });
		expect(big).toBeGreaterThan(base * 2);
		const ai = estimateExportSeconds({
			msPerFrame: 20,
			frames: 1800,
			pixelRatio: 1,
			extraMsPerFrame: 200,
		});
		expect(ai - base).toBeCloseTo(360);
	});

	test("reads naturally", () => {
		expect(formatEstimate(30)).toBe("under a minute");
		expect(formatEstimate(360)).toBe("about 6 min");
		expect(formatEstimate(3 * 3600 + 600)).toBe("about 3 h 10 min");
	});
});
