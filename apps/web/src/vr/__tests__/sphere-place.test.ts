import { describe, expect, test } from "bun:test";
import { placementFromParams, scalePlacement } from "../projection";

describe("pinning to the 360° sphere", () => {
	test("defaults face the front at the laid-out size", () => {
		const p = placementFromParams({});
		expect([p.yaw, p.pitch, p.roll, p.place]).toEqual([0, 0, 0, true]);
		expect(p.planeHalfWidth).toBeCloseTo(Math.PI, 6);
	});
	test("bigger size, smaller card half-width; pitch kept off the poles", () => {
		const p = placementFromParams({ size: 200, pitch: 120, yaw: 90 });
		expect(p.planeHalfWidth).toBeCloseTo(Math.PI / 2, 6);
		expect(p.pitch).toBe(85);
		expect(p.yaw).toBe(90);
	});
	test("a picture covering a quarter of the frame gets a quarter of the card", () => {
		const p = scalePlacement({ projection: placementFromParams({}), fraction: 0.25 });
		expect(p.planeHalfWidth).toBeCloseTo(Math.PI / 4, 6);
	});
});
