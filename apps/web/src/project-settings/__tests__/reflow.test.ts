/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- partial fixtures */
import { describe, expect, test } from "bun:test";
import { reflowElements } from "../reflow";

// Minimal shapes: the function reads ids, mediaId and transform params.
const video = (params: Record<string, number>) => ({
	id: "v1",
	type: "video",
	mediaId: "m1",
	params: { "transform.scaleX": 1, "transform.scaleY": 1, ...params },
});
const text = (params: Record<string, number>) => ({
	id: "t1",
	type: "text",
	params: { "transform.positionX": 0, "transform.positionY": 0, ...params },
});
const tracks = (elements: unknown[]) =>
	({ main: { id: "main", elements }, overlay: [], audio: [] }) as never;
const assets = [{ id: "m1", width: 1920, height: 1080 }] as never;
const from = { width: 1920, height: 1080 };

describe("reflowElements", () => {
	test("fit scales offsets with the frame", () => {
		const [patch] = reflowElements({
			tracks: tracks([
				text({ "transform.positionX": 100, "transform.positionY": -50 }),
			]),
			assets,
			from,
			to: { width: 1280, height: 720 },
			mode: "fit",
		});
		expect(patch.patch.params?.["transform.positionX"]).toBeCloseTo(66.667, 2);
		expect(patch.patch.params?.["transform.positionY"]).toBeCloseTo(-33.333, 2);
	});
	test("fill covers a vertical frame", () => {
		const [patch] = reflowElements({
			tracks: tracks([video({})]),
			assets,
			from,
			to: { width: 1080, height: 1920 },
			mode: "fill",
		});
		// contain = 1080/1920, cover = 1920/1080 → ratio (16/9)^2
		expect(patch.patch.params?.["transform.scaleX"]).toBeCloseTo(
			(16 / 9) ** 2,
			4,
		);
		expect(patch.patch.params?.["transform.positionX"]).toBe(0);
	});
	test("keep holds the pixel size", () => {
		const [patch] = reflowElements({
			tracks: tracks([video({})]),
			assets,
			from,
			to: { width: 3840, height: 2160 },
			mode: "keep",
		});
		expect(patch.patch.params?.["transform.scaleX"]).toBeCloseTo(0.5, 6);
	});
	test("no change, no patches", () => {
		expect(
			reflowElements({
				tracks: tracks([video({})]),
				assets,
				from,
				to: from,
				mode: "fit",
			}),
		).toEqual([]);
	});
});

describe("text on a new shape (PS-11)", () => {
	test("16:9 → 9:16 shrinks text and keeps it inside the frame", async () => {
		const { reflowText } = await import("../reflow");
		const out = reflowText({
			params: { fontSize: 40 },
			from: { width: 1920, height: 1080 },
			to: { width: 1080, height: 1920 },
			x: 800 * (1080 / 1920),
			y: 0,
		});
		expect(out.fontSize).toBeCloseTo(40 * Math.sqrt(0.31640625), 1);
		expect(Math.abs(out["transform.positionX"])).toBeLessThanOrEqual(1080 * 0.44);
	});

	test("never grows on a wider frame; far-off positions are pulled in", async () => {
		const { reflowText } = await import("../reflow");
		const out = reflowText({
			params: { fontSize: 20 },
			from: { width: 1080, height: 1920 },
			to: { width: 1920, height: 1080 },
			x: 5000,
			y: -5000,
		});
		expect(out.fontSize).toBeUndefined();
		expect(out["transform.positionX"]).toBeCloseTo(1920 * 0.44);
		expect(out["transform.positionY"]).toBeCloseTo(-1080 * 0.44);
	});
});

test("a long line shrinks until it fits the safe width", async () => {
	const { reflowText } = await import("../reflow");
	const out = reflowText({
		params: { fontSize: 20 },
		from: { width: 1920, height: 1080 },
		to: { width: 1080, height: 1920 },
		x: 0,
		y: 0,
		width: 2400,
	});
	// 2400 px wide at size 20 → must fit in 1080 × 0.88 = 950 px.
	expect(out.fontSize).toBeLessThanOrEqual((20 * 950.4) / 2400);
});
