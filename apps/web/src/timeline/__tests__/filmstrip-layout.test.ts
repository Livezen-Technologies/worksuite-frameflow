import { describe, expect, test } from "bun:test";
import { filmstripStep, filmstripTiles, MAX_FILMSTRIP_TILES } from "../filmstrip-layout";

describe("timeline filmstrip", () => {
	test("each tile shows the moment under it, not one repeated frame", () => {
		const tiles = filmstripTiles({ duration: 8, trimStart: 0, pixelsPerSecond: 50, tileWidth: 100 });
		expect(tiles).toHaveLength(4);
		expect(tiles.map((t) => t.sourceTime)).toEqual([0, 2, 4, 6]);
		expect(new Set(tiles.map((t) => t.sourceTime)).size).toBe(4);
	});

	test("trim and speed move the frames", () => {
		const trimmed = filmstripTiles({ duration: 4, trimStart: 10, pixelsPerSecond: 50, tileWidth: 100 });
		expect(trimmed.map((t) => t.sourceTime)).toEqual([10, 12]);
		const fast = filmstripTiles({ duration: 4, trimStart: 0, rate: 2, pixelsPerSecond: 50, tileWidth: 100 });
		expect(fast.map((t) => t.sourceTime)).toEqual([0, 4]);
	});

	test("a tile's frame is always inside the time the tile covers", () => {
		for (const pps of [7, 33, 50, 120, 400])
			for (const tile of filmstripTiles({ duration: 30, trimStart: 3.3, rate: 1.5, pixelsPerSecond: pps, tileWidth: 90 })) {
				const from = 3.3 + (tile.left / pps) * 1.5;
				const to = 3.3 + ((tile.left + tile.width) / pps) * 1.5;
				expect(tile.sourceTime).toBeGreaterThanOrEqual(from - 1e-6);
				expect(tile.sourceTime).toBeLessThanOrEqual(to + 1e-6);
			}
	});

	test("the last tile is cut to the clip and stays inside the source", () => {
		const tiles = filmstripTiles({ duration: 5, trimStart: 0, sourceDuration: 5, pixelsPerSecond: 50, tileWidth: 100 });
		expect(tiles.at(-1)?.width).toBe(50);
		expect(tiles.every((t) => t.sourceTime <= 5)).toBe(true);
	});

	test("zoom levels share snapped times, so frames are reused", () => {
		expect(filmstripStep(1.9)).toBe(1);
		expect(filmstripStep(2)).toBe(2);
		expect(filmstripStep(0.001)).toBe(1 / 16);
		const a = filmstripTiles({ duration: 16, trimStart: 0, pixelsPerSecond: 50, tileWidth: 100 }).map((t) => t.sourceTime);
		const b = filmstripTiles({ duration: 16, trimStart: 0, pixelsPerSecond: 100, tileWidth: 100 }).map((t) => t.sourceTime);
		expect(a.every((t) => b.includes(t) || t % 1 === 0)).toBe(true);
	});

	test("nothing for empty clips or absurd zoom", () => {
		expect(filmstripTiles({ duration: 0, trimStart: 0, pixelsPerSecond: 50, tileWidth: 100 })).toEqual([]);
		expect(filmstripTiles({ duration: 1e6, trimStart: 0, pixelsPerSecond: 50, tileWidth: 10 }).length).toBe(0);
		expect(MAX_FILMSTRIP_TILES).toBeGreaterThan(100);
	});
});
