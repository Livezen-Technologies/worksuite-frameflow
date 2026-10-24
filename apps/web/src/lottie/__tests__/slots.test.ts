import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyBrandKit, parseMotion, rebaseOnPackVersion, serializeMotion, setImageOverride, setLayerHidden, setTextOverride, setTiming } from "../motion-editor/overrides";
import { lottieSourceFromKey, lottieSourceKey } from "../player";
import {
	alignedX,
	applyCase,
	fitFontSize,
	hideLayerPaint,
	imageDrawRect,
	layersToHide,
	layerToCanvasMatrix,
	liveTextSlots,
	localBox,
	namedLayers,
	slotText,
} from "../slots";
import { motionTimingDuration, motionTimingFrame } from "../timing";
import type { LottieElementData, LottieJson, WorksuiteAssetMeta } from "../types";

const packDir = join(import.meta.dir, "..", "..", "..", "..", "..", "assets", "worksuite-pack");
const meta = JSON.parse(readFileSync(join(packDir, "subscribe-buttons", "sub-avatar-bar", "asset.json"), "utf8")) as WorksuiteAssetMeta;
const json = JSON.parse(readFileSync(join(packDir, "subscribe-buttons", "sub-avatar-bar", "sub-avatar-bar.json"), "utf8")) as LottieJson;

const clip: LottieElementData = {
	source: { kind: "pack", assetId: "sub-avatar-bar", variant: "en" },
	colors: {},
	width: 1100,
	height: 300,
	fps: 30,
	frames: 105,
	loop: false,
	speed: 1,
};

describe("pack slots", () => {
	test("sub-avatar-bar has an avatar image slot and channel / button text slots on real layers", () => {
		expect(meta.imageSlots?.map((s) => s.id)).toEqual(["avatar"]);
		expect(meta.textSlots?.map((s) => s.id).sort()).toEqual(["channel", "subscribe", "subscribed", "subscribers"]);
		const names = new Set(namedLayers(json).map((l) => l.name));
		for (const slot of [...(meta.textSlots ?? []), ...(meta.imageSlots ?? [])]) expect(names.has(slot.layer)).toBe(true);
		expect(meta.textSlots?.find((s) => s.id === "subscribe")?.defaults.si).toContain("සබ්ස්ක්");
	});
});

describe("text slots", () => {
	const slot = { defaults: { en: "SUBSCRIBE", si: "සබ්ස්ක්‍රයිබ්", ta: "சப்ஸ்கிரைப்" }, uppercase: true };
	test("words: override, then language default, then English", () => {
		expect(slotText({ slot, lang: "si" })).toBe("සබ්ස්ක්‍රයිබ්");
		expect(slotText({ slot, lang: "fr" })).toBe("SUBSCRIBE");
		expect(slotText({ slot, override: { text: "join us" } })).toBe("JOIN US");
		expect(slotText({ slot, override: { text: "join us", case: "title" } })).toBe("Join Us");
		expect(applyCase("ABC", "lower")).toBe("abc");
	});
	test("auto-fit shrinks long text to the box and never grows past the size", () => {
		const measure = (size: number) => size * 0.6 * 30; // 30 characters
		const size = fitFontSize({ measure, fontSize: 60, box: { w: 300, h: 80 } });
		expect(measure(size)).toBeLessThanOrEqual(300);
		expect(size).toBeGreaterThan(15);
		expect(fitFontSize({ measure: (s) => s, fontSize: 40, box: { w: 1000, h: 200 } })).toBe(40);
		// Height limits too.
		expect(fitFontSize({ measure: () => 1, fontSize: 100, box: { w: 1000, h: 46 } })).toBeCloseTo(40, 0);
	});
	test("alignment and local box", () => {
		expect(alignedX({ x: 10, w: 100 }, 40, "center")).toBe(40);
		expect(alignedX({ x: 10, w: 100 }, 40, "right")).toBe(70);
		expect(localBox({ box: { x: 250, y: 102, w: 360, h: 48 }, origin: [250, 126] })).toEqual({ x: 0, y: -24, w: 360, h: 48 });
	});
	test("live text hides the outline layer's paint but keeps its transform", () => {
		const data = setTextOverride(clip, "subscribe", { text: "JOIN" });
		const hide = layersToHide({ textSlots: meta.textSlots ?? [], imageSlots: meta.imageSlots ?? [], overrides: data.slots });
		expect(hide.paint).toEqual(["slot:text:subscribe"]);
		const out = hideLayerPaint(json, hide);
		const layer = (out.layers as Array<{ nm: string; shapes: unknown; ks: unknown }>).find((l) => l.nm === "slot:text:subscribe");
		expect(JSON.stringify(layer?.shapes)).toContain('"o":{"a":0,"k":0}');
		expect(layer?.ks).toEqual((json.layers as Array<{ nm: string; ks: unknown }>).find((l) => l.nm === "slot:text:subscribe")?.ks);
		expect(liveTextSlots(meta.textSlots ?? [], data.slots).map((s) => s.id)).toEqual(["subscribe"]);
		// The source isn't mutated.
		const count = (text: string) => text.split('"o":{"a":0,"k":0}').length;
		expect(count(JSON.stringify(out))).toBeGreaterThan(count(JSON.stringify(json)));
		expect(out).not.toBe(json);
	});
});

describe("image slots", () => {
	const mask = { shape: "ellipse" as const, w: 150, h: 150 };
	test("fill covers the mask, fit shows the whole picture", () => {
		const fill = imageDrawRect({ image: { width: 400, height: 200 }, mask, override: { fit: "fill", zoom: 1, offsetX: 0, offsetY: 0 } });
		expect(fill).toEqual({ x: -150, y: -75, w: 300, h: 150 });
		const fit = imageDrawRect({ image: { width: 400, height: 200 }, mask, override: { fit: "fit", zoom: 1, offsetX: 0, offsetY: 0 } });
		expect(fit).toEqual({ x: -75, y: -37.5, w: 150, h: 75 });
		const moved = imageDrawRect({ image: { width: 100, height: 100 }, mask, override: { fit: "fill", zoom: 2, offsetX: 0.1, offsetY: -0.1 } });
		expect(moved).toEqual({ x: -150 + 15, y: -150 - 15, w: 300, h: 300 });
	});
	test("layer matrix maps comp → contain-fitted canvas", () => {
		const props = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 140, 150, 0, 1];
		expect(layerToCanvasMatrix({ props, comp: { w: 1100, h: 300 }, canvas: { width: 550, height: 300 } })).toEqual([0.5, 0, 0, 0.5, 70, 150]);
	});
});

describe("overrides", () => {
	test("round trip through serialisation", () => {
		let data = setTextOverride(clip, "channel", { text: "Lanka Bites", fontWeight: 800 });
		data = setImageOverride(data, "avatar", { src: "data:image/png;base64,AAAA", fit: "fill", zoom: 1.2, offsetX: 0, offsetY: 0.1 });
		data = setLayerHidden(data, "Panel", true);
		data = setTiming(data, { delay: 0.5, endHold: 1 });
		expect(parseMotion(serializeMotion(data))).toEqual(data);
		// Clearing everything returns the plain clip.
		let cleared = setTextOverride(data, "channel", null);
		cleared = setImageOverride(cleared, "avatar", null);
		cleared = setLayerHidden(cleared, "Panel", false);
		cleared = setTiming(cleared, { delay: 0, endHold: 0 });
		expect(cleared).toEqual(clip);
	});
	test("overrides survive a pack version bump; vanished slots are dropped", () => {
		let data: LottieElementData = { ...clip, source: { kind: "pack", assetId: "sub-avatar-bar", pack: { id: "subscribe-buttons", version: "1.1.0" } } };
		data = setTextOverride(data, "channel", { text: "Lanka Bites" });
		data = setTextOverride(data, "old-slot", { text: "x" });
		data = setImageOverride(data, "avatar", { src: "data:x", fit: "fill", zoom: 1, offsetX: 0, offsetY: 0 });
		const { data: next, dropped } = rebaseOnPackVersion({ data, asset: { textSlots: meta.textSlots, imageSlots: meta.imageSlots, pack: { id: "subscribe-buttons", version: "1.2.0" } }, json });
		expect(dropped).toEqual(["old-slot"]);
		expect(next.slots?.text?.channel?.text).toBe("Lanka Bites");
		expect(next.slots?.image?.avatar?.src).toBe("data:x");
		expect(next.source).toEqual({ kind: "pack", assetId: "sub-avatar-bar", pack: { id: "subscribe-buttons", version: "1.2.0" } });
	});
	test("brand kit fills colour slots and the font", () => {
		const asset = { colors: meta.colors, textSlots: meta.textSlots };
		const data = applyBrandKit({ data: clip, asset, brandColors: ["#112233"], brandFont: "Poppins" });
		expect(Object.values(data.colors).every((c) => c === "#112233")).toBe(true);
		expect(data.slots?.text?.channel?.fontFamily).toBe("Poppins");
	});
	test("pack-qualified source keys round trip (and old keys still parse)", () => {
		const source = { kind: "pack" as const, assetId: "sub-avatar-bar", variant: "si", pack: { id: "subscribe-buttons", version: "1.1.0" } };
		expect(lottieSourceFromKey(lottieSourceKey(source))).toEqual(source);
		expect(lottieSourceFromKey("pack:sub-glass@ta")).toEqual({ kind: "pack", assetId: "sub-glass", variant: "ta" });
	});
});

describe("motion timing", () => {
	test("delay holds the first frame, trim plays a window, end hold extends the clip", () => {
		const timing = { delay: 1, trimIn: 0.5, trimOut: 0.5, endHold: 2 };
		expect(motionTimingFrame({ clipSeconds: 0.5, speed: 1, fps: 30, frames: 90, loop: false, timing })).toBe(15);
		expect(motionTimingFrame({ clipSeconds: 1.5, speed: 1, fps: 30, frames: 90, loop: false, timing })).toBeCloseTo(30);
		expect(motionTimingFrame({ clipSeconds: 10, speed: 1, fps: 30, frames: 90, loop: false, timing })).toBeCloseTo(74);
		expect(motionTimingDuration({ fps: 30, frames: 90, speed: 1, timing })).toBeCloseTo(1 + 2 + 2);
	});
});
