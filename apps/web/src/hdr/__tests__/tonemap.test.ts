import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TONE_MAP,
	hlgOotf,
	hlgToScene,
	pqToNits,
	rolloffCurve,
	toneMapPixel,
} from "../tonemap";
import {
	resolveMediaHdr,
	setProjectHdrSettings,
	transferFromColorSpace,
} from "../settings";

/** PQ signal for a given brightness (inverse of pqToNits). */
function nitsToPq(nits: number): number {
	const m1 = 2610 / 16384;
	const m2 = (2523 / 4096) * 128;
	const c1 = 3424 / 4096;
	const c2 = (2413 / 4096) * 32;
	const c3 = (2392 / 4096) * 32;
	const y = (nits / 10000) ** m1;
	return ((c1 + c2 * y) / (1 + c3 * y)) ** m2;
}

describe("transfer functions", () => {
	test("PQ hits its reference points", () => {
		expect(pqToNits(1)).toBeCloseTo(10000, 0);
		expect(pqToNits(nitsToPq(203))).toBeCloseTo(203, 1);
		expect(pqToNits(0)).toBe(0);
	});

	test("HLG 75% signal is about reference white on a 1,000-nit display", () => {
		const s = hlgToScene(0.75);
		const [r] = hlgOotf([s, s, s]);
		// BT.2408: HLG reference white (75%) ≈ 203 nits.
		expect(r).toBeGreaterThan(185);
		expect(r).toBeLessThan(225);
	});
});

describe("tone mapping", () => {
	test("roll-off leaves mid-tones alone and never exceeds white", () => {
		expect(rolloffCurve({ x: 0.3, rolloff: 0.5 })).toBeCloseTo(0.3, 6);
		for (const x of [1, 2, 5, 50])
			expect(rolloffCurve({ x, rolloff: 0.5 })).toBeLessThanOrEqual(1);
		// Monotonic: brighter in is brighter out.
		expect(rolloffCurve({ x: 4, rolloff: 0.5 })).toBeGreaterThan(
			rolloffCurve({ x: 2, rolloff: 0.5 }),
		);
	});

	test("PQ reference white maps near SDR white, 1,000 nits doesn't clip", () => {
		const white = nitsToPq(203);
		const [w] = toneMapPixel({
			rgb: [white, white, white],
			transfer: "pq",
			settings: DEFAULT_TONE_MAP,
		});
		expect(w).toBeGreaterThan(0.85);
		expect(w).toBeLessThan(1);
		const bright = nitsToPq(1000);
		const [b] = toneMapPixel({
			rgb: [bright, bright, bright],
			transfer: "pq",
			settings: DEFAULT_TONE_MAP,
		});
		expect(b).toBeGreaterThan(w);
		expect(b).toBeLessThan(1);
	});

	test("HLG grey stays neutral", () => {
		const [r, g, b] = toneMapPixel({
			rgb: [0.5, 0.5, 0.5],
			transfer: "hlg",
			settings: DEFAULT_TONE_MAP,
		});
		expect(Math.abs(r - g)).toBeLessThan(0.01);
		expect(Math.abs(g - b)).toBeLessThan(0.01);
	});

	test("saturation 0 gives grey", () => {
		const [r, g, b] = toneMapPixel({
			rgb: [0.6, 0.3, 0.2],
			transfer: "hlg",
			settings: { ...DEFAULT_TONE_MAP, saturation: 0 },
		});
		expect(Math.abs(r - g)).toBeLessThan(0.02);
		expect(Math.abs(g - b)).toBeLessThan(0.02);
	});
});

describe("settings", () => {
	test("per-media override wins over detection and project defaults", () => {
		setProjectHdrSettings({
			settings: {
				toneMap: { rolloff: 0.2 },
				media: { m1: { source: "pq", saturation: 1.5 } },
			},
		});
		const r = resolveMediaHdr({ mediaId: "m1", detected: "hlg" });
		expect(r.transfer).toBe("pq");
		expect(r.settings).toEqual({ rolloff: 0.2, saturation: 1.5, exposure: 0 });
		expect(resolveMediaHdr({ mediaId: "m2", detected: "hlg" }).transfer).toBe(
			"hlg",
		);
		setProjectHdrSettings({ settings: undefined });
	});

	test("browser transfer names", () => {
		expect(transferFromColorSpace("hlg")).toBe("hlg");
		expect(transferFromColorSpace("pq")).toBe("pq");
		expect(transferFromColorSpace("bt709")).toBe("sdr");
		expect(transferFromColorSpace(null)).toBe("sdr");
	});
});
