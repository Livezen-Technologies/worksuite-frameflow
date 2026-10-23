import { describe, expect, test } from "bun:test";
import { generateZooms } from "../generate";
import { screenZoomAt, smoothedCursor, zoomOffset } from "../evaluate";
import { DEFAULT_ZOOM_SETTINGS, type CursorLog } from "../types";

const log = ({
	clicks,
	samples = [],
}: {
	clicks: [number, number, number][];
	samples?: [number, number, number][];
}): CursorLog => ({
	version: 1,
	display: { width: 1920, height: 1080 },
	samples,
	clicks: clicks.map(([t, x, y]) => [t, x, y, 1]),
	keys: [],
	typing: [],
});

describe("auto zoom", () => {
	test("clicks close together make one zoom; far apart make two", () => {
		const zooms = generateZooms({
			log: log({
				clicks: [
					[2, 0.2, 0.2],
					[2.8, 0.22, 0.21],
					[12, 0.8, 0.8],
				],
			}),
			duration: 20,
			settings: DEFAULT_ZOOM_SETTINGS,
		});
		expect(zooms).toHaveLength(2);
		expect(zooms[0].start).toBeLessThan(2);
		expect(zooms[0].x).toBeCloseTo(0.21, 2);
		expect(zooms[1].x).toBeCloseTo(0.8, 2);
		expect(zooms[0].level).toBe(2);
	});

	test("zoom ends early when the cursor leaves", () => {
		const stay = generateZooms({
			log: log({ clicks: [[1, 0.2, 0.2]] }),
			duration: 20,
			settings: DEFAULT_ZOOM_SETTINGS,
		})[0];
		const leave = generateZooms({
			log: log({ clicks: [[1, 0.2, 0.2]], samples: [[1.6, 0.9, 0.9]] }),
			duration: 20,
			settings: DEFAULT_ZOOM_SETTINGS,
		})[0];
		expect(leave.end).toBeLessThan(stay.end);
	});

	test("level eases in and out and the view stays inside the frame", () => {
		const zoom = {
			segments: [
				{
					id: "z",
					start: 1,
					end: 5,
					level: 2,
					follow: false,
					x: 0.02,
					y: 0.5,
					ease: 0.5,
				},
			],
			settings: DEFAULT_ZOOM_SETTINGS,
		};
		expect(screenZoomAt({ zoom, seconds: 0.5 }).scale).toBe(1);
		expect(screenZoomAt({ zoom, seconds: 1.25 }).scale).toBeGreaterThan(1);
		expect(screenZoomAt({ zoom, seconds: 1.25 }).scale).toBeLessThan(2);
		const full = screenZoomAt({ zoom, seconds: 3 });
		expect(full.scale).toBe(2);
		expect(full.x).toBe(0.25); // clamped: half the view is 0.25 of the frame
	});

	test("following the cursor is smooth", () => {
		const samples: [number, number, number][] = [];
		for (let i = 0; i <= 60; i++)
			samples.push([i / 30, i % 2 ? 0.52 : 0.48, 0.5]); // jittery
		const c = smoothedCursor({ log: log({ clicks: [], samples }), t: 1.5 });
		expect(c?.x).toBeCloseTo(0.5, 1);
	});

	test("offset keeps the focus point in place", () => {
		const { dx, dy } = zoomOffset({
			scale: 2,
			x: 0.75,
			y: 0.25,
			width: 1000,
			height: 500,
		});
		expect(dx).toBe(-250);
		expect(dy).toBe(125);
	});
});
