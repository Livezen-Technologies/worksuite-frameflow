import { describe, expect, test } from "bun:test";
import {
	createLayer,
	createMotionProject,
	EASES,
	easeAt,
	editProp,
	layerBounds,
	pathD,
	removeKeyframe,
	setKeyframe,
	snapBox,
	valueAt,
} from "../model";

const project = createMotionProject({ width: 1000, height: 500 });

describe("motion model", () => {
	test("easing curves", () => {
		expect(easeAt({ ease: EASES.linear, p: 0.3 })).toBeCloseTo(0.3);
		expect(easeAt({ ease: EASES.easeIn, p: 0.5 })).toBeLessThan(0.5);
		expect(easeAt({ ease: EASES.easeOut, p: 0.5 })).toBeGreaterThan(0.5);
		expect(easeAt({ ease: EASES.easeInOut, p: 0.5 })).toBeCloseTo(0.5, 2);
	});

	test("keyframes interpolate, hold at the ends, and replace at the same time", () => {
		let layer = createLayer({ kind: "rect", project });
		layer = setKeyframe({ layer, prop: "x", t: 0, v: 0, ease: EASES.linear });
		layer = setKeyframe({ layer, prop: "x", t: 2, v: 100 });
		expect(valueAt({ layer, prop: "x", t: 1 })).toBeCloseTo(50);
		expect(valueAt({ layer, prop: "x", t: -1 })).toBe(0);
		expect(valueAt({ layer, prop: "x", t: 5 })).toBe(100);
		layer = setKeyframe({ layer, prop: "x", t: 2, v: 200 });
		expect(layer.keyframes.x).toHaveLength(2);
		expect(layer.keyframes.x?.[0].ease).toEqual(EASES.linear);
		layer = removeKeyframe({ layer, prop: "x", t: 0 });
		layer = removeKeyframe({ layer, prop: "x", t: 2 });
		expect(layer.keyframes.x).toBeUndefined();
	});

	test("edits auto-key animated properties only", () => {
		let layer = createLayer({ kind: "ellipse", project });
		layer = editProp({ layer, prop: "opacity", t: 1, v: 0.5 });
		expect(layer.opacity).toBe(0.5);
		layer = setKeyframe({ layer, prop: "y", t: 0, v: 10 });
		layer = editProp({ layer, prop: "y", t: 1, v: 20 });
		expect(layer.keyframes.y?.map((k) => k.t)).toEqual([0, 1]);
	});

	test("bounds follow anchor, scale and rotation", () => {
		const layer = { ...createLayer({ kind: "rect", project }), x: 100, y: 100, w: 40, h: 20 } as const;
		expect(layerBounds({ layer, t: 0 })).toEqual({ left: 80, right: 120, top: 90, bottom: 110 });
		const rotated = layerBounds({ layer: { ...layer, rotation: 90, scale: 2 }, t: 0 });
		expect(rotated.right - rotated.left).toBeCloseTo(40);
		expect(rotated.bottom - rotated.top).toBeCloseTo(80);
	});

	test("snapping picks the nearest line within the threshold", () => {
		const canvas = { left: 0, top: 0, right: 1000, bottom: 500 };
		const snap = snapBox({ box: { left: 446, right: 546, top: 10, bottom: 60 }, targets: [canvas], threshold: 6 });
		expect(snap.dx).toBe(4);
		expect(snap.guides).toEqual([{ axis: "x", at: 500 }]);
		expect(snapBox({ box: { left: 300, right: 340, top: 300, bottom: 340 }, targets: [canvas], threshold: 6 }).guides).toEqual([]);
	});

	test("path data with curves and closing", () => {
		expect(pathD({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true })).toBe("M0 0 L10 0 L10 10 L0 0 Z");
		expect(pathD({ points: [{ x: 0, y: 0, out: { x: 5, y: 0 } }, { x: 10, y: 10, in: { x: 0, y: -5 } }], closed: false })).toBe(
			"M0 0 C5 0 10 5 10 10",
		);
	});
});
