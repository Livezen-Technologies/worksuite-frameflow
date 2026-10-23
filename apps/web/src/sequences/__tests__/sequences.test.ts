import { describe, expect, test } from "bun:test";
import { shapeLabel, sizeForShape } from "../service";

describe("sequences", () => {
	test("a vertical copy keeps the short side", () => {
		expect(
			sizeForShape({ ratio: [9, 16], current: { width: 1920, height: 1080 } }),
		).toEqual({ width: 1080, height: 1920 });
		expect(
			sizeForShape({ ratio: [1, 1], current: { width: 1080, height: 1920 } }),
		).toEqual({ width: 1080, height: 1080 });
	});

	test("labels by shape", () => {
		expect(shapeLabel({ width: 1080, height: 1920 })).toBe("9:16");
		expect(shapeLabel({ width: 1000, height: 300 })).toBe("1000×300");
	});
});
