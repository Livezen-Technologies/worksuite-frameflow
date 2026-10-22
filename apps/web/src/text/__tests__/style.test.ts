import { describe, expect, test } from "bun:test";
import {
	graphemeCount,
	readTextStyleEffects,
	sliceGraphemes,
	textAnimationState,
} from "../style";

describe("text style", () => {
	test("sizes scale with the font", () => {
		const effects = readTextStyleEffects({
			params: {
				"stroke.enabled": true,
				"stroke.width": 10,
				"glow.enabled": false,
			},
			fontSizePx: 100,
		});
		expect(effects.stroke?.widthPx).toBe(10);
		expect(effects.glow).toBeUndefined();
	});

	test("Sinhala graphemes are never split", () => {
		const text = "ශ්‍රී ලංකා";
		expect(graphemeCount(text)).toBeLessThan([...text].length);
		const first = sliceGraphemes({ text, count: 1 });
		expect(first.length).toBeGreaterThan(1);
		expect(text.startsWith(first)).toBe(true);
	});

	test("typewriter reveals over the in duration", () => {
		const params = { "animation.in": "typewriter", "animation.inDuration": 1 };
		expect(
			textAnimationState({ params, localSeconds: 0.5, durationSeconds: 5 })
				.reveal,
		).toBeCloseTo(0.5);
		expect(
			textAnimationState({ params, localSeconds: 2, durationSeconds: 5 })
				.reveal,
		).toBe(1);
	});

	test("fade out reaches zero at the clip end", () => {
		const params = { "animation.out": "fade", "animation.outDuration": 1 };
		expect(
			textAnimationState({ params, localSeconds: 5, durationSeconds: 5 })
				.opacity,
		).toBe(0);
		expect(
			textAnimationState({ params, localSeconds: 2, durationSeconds: 5 })
				.opacity,
		).toBe(1);
	});
});
