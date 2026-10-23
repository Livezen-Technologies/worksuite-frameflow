import { describe, expect, test } from "bun:test";
import { applyPlacement } from "@/timeline/placement/apply";
import type { GraphicElement, SceneTracks } from "@/timeline";
import type { PackIndexAsset } from "../catalog";
import { searchPackAssets } from "../catalog";
import {
	brandColorOverrides,
	lottieDataFromJson,
	lottieDataFromPackAsset,
	lottieInsertScale,
	packAssetInsertParams,
	resolveSlotColors,
	setSlotColor,
} from "../element";
import { LOTTIE_GRAPHIC_DEFINITION_ID, type LottieColorSlot } from "../types";
import { lottieResolutionFor } from "@/services/renderer/nodes/lottie-node";

const slots: LottieColorSlot[] = [
	{ id: "main", name: "Main", default: "#4C8DFF" },
	{ id: "accent", name: "Accent", default: "#F5A524" },
	{ id: "text", name: "Light", default: "#FFFFFF" },
];

const asset: PackIndexAsset = {
	id: "lt-bar-slide",
	name: "Bar slide",
	category: "lower-thirds",
	path: "lower-thirds/lt-bar-slide",
	tags: ["lower third", "news"],
	durationSec: 4,
	loop: false,
	width: 1920,
	height: 1080,
	colors: slots,
	files: {},
};

describe("animation elements", () => {
	test("pack assets become element data that references the asset", () => {
		expect(lottieDataFromPackAsset(asset)).toEqual({
			source: { kind: "pack", assetId: "lt-bar-slide" },
			colors: {},
			width: 1920,
			height: 1080,
			fps: 30,
			frames: 120,
			loop: false,
			speed: 1,
		});
	});

	test("imported files take size, rate and length from the file", () => {
		const data = lottieDataFromJson({
			source: { kind: "user", id: "abc" },
			json: { fr: 24, ip: 10, op: 58, w: 800, h: 600, layers: [] },
		});
		expect(data).toMatchObject({ width: 800, height: 600, fps: 24, frames: 48, loop: true });
	});

	test("insert scale: contained share of the frame, or covering it", () => {
		expect(lottieInsertScale({ width: 1080, height: 1080, frame: { width: 1920, height: 1080 }, scale: 0.4 })).toEqual({
			"transform.scaleX": 0.4,
			"transform.scaleY": 0.4,
		});
		// A 16:9 wipe on a 9:16 frame grows until it covers it.
		const cover = lottieInsertScale({ width: 1920, height: 1080, frame: { width: 1080, height: 1920 }, scale: "cover" });
		expect(cover["transform.scaleX"]).toBeCloseTo((1920 / 1080) * (1920 / 1080));
		expect(packAssetInsertParams({ asset, frame: { width: 1920, height: 1080 } })).toEqual({
			"transform.scaleX": 1,
			"transform.scaleY": 1,
		});
	});

	test("colour slots: set, reset and resolve", () => {
		let overrides = setSlotColor({ overrides: {}, slot: slots[0], color: "#ff0000" });
		expect(overrides).toEqual({ "#4C8DFF": "#FF0000" });
		overrides = setSlotColor({ overrides, slot: slots[1], color: "#00ff00" });
		expect(resolveSlotColors({ slots, overrides }).map((s) => s.value)).toEqual(["#FF0000", "#00FF00", "#FFFFFF"]);
		overrides = setSlotColor({ overrides, slot: slots[0], color: "#4c8dff" });
		expect(overrides).toEqual({ "#F5A524": "#00FF00" });
	});

	test("brand colours fill slots in order, or a picked colour goes to the main slot", () => {
		expect(brandColorOverrides({ slots, brandColors: ["#111111", "#222222"] })).toEqual({
			"#4C8DFF": "#111111",
			"#F5A524": "#222222",
			"#FFFFFF": "#111111",
		});
		expect(brandColorOverrides({ slots, brandColors: ["#111111"], color: "#ABCDEF" })).toEqual({ "#4C8DFF": "#ABCDEF" });
		expect(brandColorOverrides({ slots, brandColors: [] })).toEqual({});
	});

	test("search matches name, category and tags", () => {
		const other = { ...asset, id: "rx-fire", name: "Fire", category: "reactions", tags: ["flame", "hot"] };
		expect(searchPackAssets({ assets: [asset, other], query: "news bar" }).map((a) => a.id)).toEqual(["lt-bar-slide"]);
		expect(searchPackAssets({ assets: [asset, other], query: "FLAME" }).map((a) => a.id)).toEqual(["rx-fire"]);
		expect(searchPackAssets({ assets: [asset, other], query: "", category: "reactions" })).toHaveLength(1);
	});

	test("insert and save round-trip keeps the reference and colours, not the animation", () => {
		const element: GraphicElement = {
			id: "el-1",
			type: "graphic",
			name: "Bar slide",
			definitionId: LOTTIE_GRAPHIC_DEFINITION_ID,
			lottie: { ...lottieDataFromPackAsset(asset), colors: { "#4C8DFF": "#FF0000" }, speed: 1.5 },
			params: { "transform.scaleX": 1, "transform.scaleY": 1 },
			duration: 480_000 as GraphicElement["duration"],
			startTime: 0 as GraphicElement["startTime"],
			trimStart: 0 as GraphicElement["trimStart"],
			trimEnd: 0 as GraphicElement["trimEnd"],
		};
		const tracks = {
			overlay: [],
			main: { id: "main", name: "Main", type: "video", elements: [], muted: false, hidden: false },
			audio: [],
		} as unknown as SceneTracks;
		const placed = applyPlacement({
			tracks,
			placementResult: { kind: "newTrack", insertIndex: 0, insertPosition: null, trackType: "graphic" },
			elements: [element],
		});
		expect(placed).not.toBeNull();
		const saved = JSON.parse(JSON.stringify(structuredClone(placed!.updatedTracks))) as SceneTracks;
		const restored = saved.overlay
			.flatMap((track) => track.elements as Array<{ id: string }>)
			.find((e) => e.id === "el-1") as GraphicElement;
		expect(restored).toEqual(element);
		expect(JSON.stringify(restored)).not.toContain("layers");
	});

	test("render resolution follows the on-screen size in quarter steps", () => {
		expect(lottieResolutionFor(0.01)).toBe(0.25);
		expect(lottieResolutionFor(0.4)).toBe(0.5);
		expect(lottieResolutionFor(1)).toBe(1);
		expect(lottieResolutionFor(1.1)).toBe(1.25);
		expect(lottieResolutionFor(9)).toBe(2);
	});
});
