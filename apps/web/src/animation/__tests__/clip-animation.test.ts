import { describe, expect, test } from "bun:test";
import { animationState, hasAnimation } from "../clip-animation";

const at = ({
	params,
	seconds,
}: {
	params: Record<string, string | number>;
	seconds: number;
}) => animationState({ params, localSeconds: seconds, durationSeconds: 4 });

describe("clip animations", () => {
	test("slide left starts off to the right and lands in place", () => {
		const params = { "animation.in": "slide-left", "animation.inDuration": 1 };
		expect(at({ params, seconds: 0 }).offsetX).toBeGreaterThan(0.5);
		expect(at({ params, seconds: 1.5 }).offsetX).toBe(0);
	});

	test("zoom out grows while it fades at the end", () => {
		const params = { "animation.out": "zoom-out", "animation.outDuration": 1 };
		const end = at({ params, seconds: 3.99 });
		expect(end.scale).toBeGreaterThan(1.4);
		expect(end.opacity).toBeLessThan(0.05);
	});

	test("combo runs across the whole clip", () => {
		const params = { "animation.combo": "ken-burns" };
		expect(at({ params, seconds: 0 }).scale).toBe(1);
		expect(at({ params, seconds: 4 }).scale).toBeCloseTo(1.15);
	});

	test("spin rotates", () => {
		const params = { "animation.in": "spin" };
		expect(Math.abs(at({ params, seconds: 0 }).rotate)).toBe(180);
	});

	test("hasAnimation", () => {
		expect(hasAnimation({})).toBe(false);
		expect(hasAnimation({ "animation.combo": "pulse" })).toBe(true);
	});
});
