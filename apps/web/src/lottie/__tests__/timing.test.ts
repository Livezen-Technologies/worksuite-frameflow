import { describe, expect, test } from "bun:test";
import { lottieDurationTicks, lottieFrameAtClipTime } from "../timing";

const TPS = 120_000;
const base = { trimStart: 0, speed: 1, fps: 30, frames: 90, loop: true, ticksPerSecond: TPS };
const at = (seconds: number, overrides: Partial<typeof base> = {}) =>
	lottieFrameAtClipTime({ ...base, ...overrides, clipTime: seconds * TPS });

describe("lottie frame for clip time", () => {
	test("plays at the authored rate", () => {
		expect(at(0)).toBe(0);
		expect(at(1)).toBe(30);
		expect(at(1.5)).toBeCloseTo(45);
	});

	test("loops seamlessly", () => {
		expect(at(3)).toBe(0);
		expect(at(4)).toBeCloseTo(30);
		expect(at(7.5)).toBeCloseTo(45);
	});

	test("holds the last frame when not looping", () => {
		expect(at(2.5, { loop: false })).toBeCloseTo(75);
		expect(at(3, { loop: false })).toBe(89);
		expect(at(20, { loop: false })).toBe(89);
	});

	test("trim start skips into the animation", () => {
		expect(at(0, { trimStart: 1 * TPS })).toBe(30);
		expect(at(2.5, { trimStart: 1 * TPS })).toBeCloseTo(15);
		expect(at(2.5, { trimStart: 1 * TPS, loop: false })).toBe(89);
	});

	test("speed scales clip time but not trim", () => {
		expect(at(1, { speed: 2 })).toBe(60);
		expect(at(1, { speed: 0.5 })).toBe(15);
		expect(at(1, { speed: 2, trimStart: 0.5 * TPS })).toBe(75);
		// Bad speeds fall back to 1×.
		expect(at(1, { speed: 0 })).toBe(30);
		expect(at(1, { speed: Number.NaN })).toBe(30);
	});

	test("negative time and empty animations are safe", () => {
		expect(at(-1)).toBe(0);
		expect(at(1, { frames: 0 })).toBe(0);
	});

	test("natural duration follows speed", () => {
		expect(lottieDurationTicks({ fps: 30, frames: 90, ticksPerSecond: TPS })).toBe(3 * TPS);
		expect(lottieDurationTicks({ fps: 30, frames: 90, speed: 2, ticksPerSecond: TPS })).toBe(1.5 * TPS);
	});
});
