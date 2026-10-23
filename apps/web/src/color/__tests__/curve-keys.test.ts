import { describe, expect, test } from "bun:test";
import { DEFAULT_CURVES, evaluateCurve } from "../curves";
import { curvesAt, keyFromCurves, parseCurveKeys, serializeCurveKeys, upsertKey } from "../curve-keys";

const bright = { ...DEFAULT_CURVES, luma: [[0, 0], [0.5, 0.8], [1, 1]] as [number, number][] };

describe("curve keyframes", () => {
	const keys = [keyFromCurves({ t: 0, curves: DEFAULT_CURVES }), keyFromCurves({ t: 2, curves: bright })];
	const mid = (t: number) => evaluateCurve({ points: curvesAt({ keys, t, fallback: DEFAULT_CURVES }).luma, x: 0.5 });

	test("holds outside the keys and blends between", () => {
		expect(mid(-1)).toBeCloseTo(0.5, 5);
		expect(mid(5)).toBeCloseTo(0.8, 5);
		expect(mid(1)).toBeCloseTo(0.65, 2);
		expect(mid(0.5)).toBeGreaterThan(0.5);
		expect(mid(0.5)).toBeLessThan(mid(1));
	});

	test("stores and replaces keys", () => {
		const text = serializeCurveKeys(keys);
		expect(parseCurveKeys(text)).toHaveLength(2);
		expect(parseCurveKeys("nonsense")).toEqual([]);
		const next = upsertKey({ keys, key: keyFromCurves({ t: 2.005, curves: DEFAULT_CURVES }) });
		expect(next.map((k) => k.t)).toEqual([0, 2.005]);
		expect(upsertKey({ keys, key: keyFromCurves({ t: 1, curves: bright }) }).map((k) => k.t)).toEqual([0, 1, 2]);
	});
});
