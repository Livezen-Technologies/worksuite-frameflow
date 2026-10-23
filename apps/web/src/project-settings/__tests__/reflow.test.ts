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
