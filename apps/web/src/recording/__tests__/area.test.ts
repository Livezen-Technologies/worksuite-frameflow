import { describe, expect, test } from "bun:test";
import { areaFromCorners, areaPixels, cropLog } from "../area";

describe("area recording", () => {
	test("a dragged box in any direction, clamped, too-small ignored", () => {
		expect(areaFromCorners({ a: [0.8, 0.9], b: [0.2, 0.1] })).toEqual({ x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.8 });
		expect(areaFromCorners({ a: [-0.2, 0.5], b: [0.5, 1.4] })).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 });
		expect(areaFromCorners({ a: [0.5, 0.5], b: [0.52, 0.9] })).toBeNull();
	});

	test("pixel rectangle is even-sized and inside the frame", () => {
		expect(areaPixels({ area: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, width: 1919, height: 1081 })).toEqual({ sx: 959, sy: 541, sw: 960, sh: 540 });
	});

	test("cursor log moves into the area's coordinates", () => {
		const log = { version: 1 as const, display: { width: 2000, height: 1000 }, samples: [[0, 0.5, 0.5]] as [number, number, number][], clicks: [[1, 0.75, 0.25, 1]] as [number, number, number, number][], keys: [], typing: [] };
		const out = cropLog({ log, area: { x: 0.5, y: 0, width: 0.5, height: 0.5 } });
		expect(out.display).toEqual({ width: 1000, height: 500 });
		expect(out.samples[0]).toEqual([0, 0, 1]);
		expect(out.clicks[0]).toEqual([1, 0.5, 0.5, 1]);
	});
});
