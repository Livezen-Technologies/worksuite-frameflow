import { describe, expect, test } from "bun:test";
import { presenterPlacements } from "../presenter";

const frame = { width: 1080, height: 1920 };

describe("presenter layouts", () => {
	test("screen above: each fills its half", () => {
		const { screen, camera } = presenterPlacements({
			layout: "screen-above",
			frame,
			screenAspect: 16 / 9,
			cameraAspect: 16 / 9,
		});
		expect(screen.positionY).toBe(-480);
		expect(camera.positionY).toBe(480);
		// 16:9 at scale 1 is 607.5 tall; it must reach 960.
		expect(screen.scale * 607.5).toBeCloseTo(960);
	});

	test("focus + inset puts the camera bottom-right, inside the frame", () => {
		const { screen, camera } = presenterPlacements({
			layout: "focus-inset",
			frame,
			screenAspect: 16 / 9,
			cameraAspect: 1,
		});
		expect(screen.scale * 607.5).toBeCloseTo(1920);
		expect(camera.positionX).toBeGreaterThan(0);
		expect(camera.positionY).toBeGreaterThan(0);
		const size = camera.scale * 1080;
		expect(camera.positionX + size / 2).toBeLessThanOrEqual(540);
	});

	test("screen on background hides the camera", () => {
		const { screen, camera } = presenterPlacements({
			layout: "screen-on-background",
			frame,
			screenAspect: 16 / 9,
			cameraAspect: 1,
		});
		expect(screen.scale).toBe(1);
		expect(camera.hidden).toBe(true);
	});
});
