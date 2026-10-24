import { describe, expect, test } from "bun:test";
import { pathD } from "../model";
import { parsePathData } from "../svg-path";

describe("svg path parsing", () => {
	test("lines, relative moves and closing", () => {
		const [p] = parsePathData("M10 10 h20 v20 H10 z");
		expect(p.closed).toBe(true);
		expect(p.points.map((q) => [q.x, q.y])).toEqual([
			[10, 10],
			[30, 10],
			[30, 30],
			[10, 30],
		]);
	});

	test("curves round-trip through pathD", () => {
		const [p] = parsePathData("M0 0 C10 0 20 10 20 20");
		expect(pathD(p)).toBe("M0 0 C10 0 20 10 20 20");
	});

	test("quadratics, smooth curves and arcs become cubics", () => {
		const [q] = parsePathData("M0 0 Q10 10 20 0 T40 0");
		expect(q.points).toHaveLength(3);
		const [a] = parsePathData("M0 50 A50 50 0 0 1 100 50");
		const last = a.points[a.points.length - 1];
		expect(last.x).toBeCloseTo(100);
		expect(last.y).toBeCloseTo(50);
		expect(a.points.length).toBe(3); // a half circle is two quarter curves
	});

	test("several subpaths", () => {
		expect(parsePathData("M0 0 L10 0 L10 10 Z M20 20 l5 0 l0 5 z")).toHaveLength(2);
	});
});

import { iconLayers, MOTION_ICONS, searchIcons } from "../icons";
import { createMotionProject } from "../model";

describe("icon library", () => {
	test("every icon becomes path layers that share a centre", () => {
		const project = createMotionProject();
		for (const icon of MOTION_ICONS) {
			const { layers } = iconLayers({ icon, project, color: "#fff" });
			expect(layers.length).toBeGreaterThan(0);
			for (const l of layers) {
				expect(l.kind).toBe("path");
				expect(Number.isFinite(l.anchorX) && Number.isFinite(l.anchorY)).toBe(true);
			}
		}
		expect(new Set(MOTION_ICONS.map((i) => i.id)).size).toBe(MOTION_ICONS.length);
		expect(searchIcons({ query: "like" }).map((i) => i.id)).toEqual(expect.arrayContaining(["heart", "thumb"]));
	});
});
