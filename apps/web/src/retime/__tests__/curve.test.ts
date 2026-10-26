import { expect, test } from "bun:test";
import {
	averageCurveSpeed,
	curveClipTime,
	curveSourceTime,
	sliceCurve,
	speedAt,
	type SpeedKeyframe,
} from "../curve";

// eslint-disable-next-line opencut/prefer-object-params -- terse fixtures
const k = (at: number, speed: number, interpolation: SpeedKeyframe["interpolation"] = "smooth"): SpeedKeyframe => ({
	id: `${at}`,
	at,
	speed,
	interpolation,
});

test("a flat curve is a constant speed", () => {
	const curve = [k(0, 2), k(1, 2)];
	expect(averageCurveSpeed(curve)).toBeCloseTo(2, 5);
	expect(curveSourceTime({ keyframes: curve, clipTime: 5, duration: 10 })).toBeCloseTo(10, 4);
});

test("source time is monotonic and ends at the source span", () => {
	const curve = [k(0, 1), k(0.3, 4), k(0.6, 0.2), k(1, 1)];
	const duration = 100;
	const span = duration * averageCurveSpeed(curve);
	let last = -1;
	for (let t = 0; t <= duration; t += 0.5) {
		const s = curveSourceTime({ keyframes: curve, clipTime: t, duration });
		expect(s).toBeGreaterThanOrEqual(last);
		last = s;
	}
	expect(last).toBeCloseTo(span, 3);
});

test("clip time and source time invert each other", () => {
	const curve = [k(0, 0.5), k(0.5, 3, "linear"), k(1, 1)];
	for (const t of [0, 7, 33, 61, 99]) {
		const s = curveSourceTime({ keyframes: curve, clipTime: t, duration: 100 });
		expect(curveClipTime({ keyframes: curve, sourceTime: s, duration: 100 })).toBeCloseTo(t, 1);
	}
});

test("smooth has no jumps; hold steps", () => {
	const curve = [k(0, 1), k(1, 3)];
	expect(speedAt({ keyframes: curve, p: 0.5 })).toBeCloseTo(2, 5);
	expect(speedAt({ keyframes: [k(0, 1, "hold"), k(1, 3)], p: 0.9 })).toBe(1);
});

test("slicing keeps the speeds at the cut", () => {
	const curve = [k(0, 1, "linear"), k(1, 3)];
	const right = sliceCurve({ keyframes: curve, from: 0.5, to: 1 });
	expect(right[0].speed).toBeCloseTo(2, 5);
	expect(right.at(-1)?.speed).toBeCloseTo(3, 5);
});

test("reverse plays the source from the end and maps back", async () => {
	const { getSourceTimeAtClipTime, getClipTimeAtSourceTime, forwardSourceTime } = await import("../resolve");
	const retime = { rate: 2, reverse: true };
	expect(getSourceTimeAtClipTime({ clipTime: 0, retime, duration: 10 })).toBe(20);
	expect(getSourceTimeAtClipTime({ clipTime: 10, retime, duration: 10 })).toBe(0);
	expect(getClipTimeAtSourceTime({ sourceTime: 5, retime, duration: 10 })).toBeCloseTo(7.5, 6);
	expect(forwardSourceTime({ clipTime: 10, retime, duration: 10 })).toBe(20);
});
