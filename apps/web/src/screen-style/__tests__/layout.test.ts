import { describe, expect, test } from "bun:test";
import type { CursorLog } from "@/screen-zoom/types";
import { cardRect, cardScale, cursorAt, keyAt, ripplesAt } from "../layout";

const log: CursorLog = {
	version: 1,
	display: { width: 1920, height: 1080 },
	samples: [
		[0, 0.1, 0.1],
		[1, 0.5, 0.5],
	],
	clicks: [[1.2, 0.5, 0.5, 0]],
	keys: [[2, "Ctrl + S"]],
	typing: [],
};

describe("screen styling", () => {
	test("a padded card keeps the screen's shape, centred", () => {
		const card = cardRect({
			canvas: { width: 1920, height: 1080 },
			source: { width: 1920, height: 1080 },
			padding: 0.1,
		});
		expect(card.height).toBeCloseTo(1080 - 216);
		expect(card.width / card.height).toBeCloseTo(16 / 9);
		expect(card.x).toBeCloseTo((1920 - card.width) / 2);
		expect(cardScale({ canvas: { width: 1920, height: 1080 }, source: { width: 1920, height: 1080 }, padding: 0.1 })).toBeCloseTo(0.8);
	});

	test("the cursor fades when idle; clicks keep it awake", () => {
		expect(cursorAt({ log, t: 1.1, smooth: false, hideAfter: 2 })).toMatchObject({ x: 0.5, opacity: 1 });
		// Last activity: the click at 1.2 s → idle 2.1 s at t=3.3, fading.
		const fading = cursorAt({ log, t: 3.4, smooth: false, hideAfter: 2 });
		expect(fading!.opacity).toBeGreaterThan(0);
		expect(fading!.opacity).toBeLessThan(1);
		expect(cursorAt({ log, t: 9, smooth: false, hideAfter: 2 })!.opacity).toBe(0);
		expect(cursorAt({ log, t: 9, smooth: false, hideAfter: 0 })!.opacity).toBe(1);
	});

	test("ripples and key badges are timed", () => {
		expect(ripplesAt({ log, t: 1.45 })[0]!.progress).toBeCloseTo(0.5);
		expect(ripplesAt({ log, t: 2 })).toHaveLength(0);
		expect(keyAt({ log, t: 2.5 })).toEqual({ label: "Ctrl + S", opacity: 1 });
		expect(keyAt({ log, t: 3.5 })).toBeNull();
	});
});
