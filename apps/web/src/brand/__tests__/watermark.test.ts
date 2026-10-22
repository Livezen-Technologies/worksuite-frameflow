import { describe, expect, test } from "bun:test";
import { watermarkTransform } from "../watermark";

describe("logo watermark", () => {
	const frame = { width: 1920, height: 1080 };

	test("bottom-right logo is 10% of the width and inset from the corner", () => {
		const t = watermarkTransform({
			frame,
			image: { width: 400, height: 200 },
			corner: "bottom-right",
			size: 10,
		});
		// 400×200 is contained at 4.8×, so 192 px wide needs 0.1×.
		expect(t["transform.scaleX"]).toBeCloseTo(0.1);
		expect(Number(t["transform.positionX"])).toBe(960 - 43 - 96);
		expect(Number(t["transform.positionY"])).toBe(Math.round(540 - 43 - 48));
	});

	test("top-left mirrors it", () => {
		const t = watermarkTransform({
			frame,
			image: { width: 400, height: 200 },
			corner: "top-left",
			size: 10,
		});
		expect(Number(t["transform.positionX"])).toBeLessThan(0);
		expect(Number(t["transform.positionY"])).toBeLessThan(0);
	});
});
