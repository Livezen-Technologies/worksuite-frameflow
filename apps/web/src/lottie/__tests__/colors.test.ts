import { describe, expect, test } from "bun:test";
import {
	collectLottieColors,
	detectColorSlots,
	hasTextLayers,
	hexToRgb01,
	normalizeColorMap,
	normalizeHex,
	parseLottie,
	recolorLottie,
	rgb01ToHex,
} from "../colors";
import type { LottieJson } from "../types";

const doc = (shapes: unknown[], extra: Partial<LottieJson> = {}): LottieJson => ({
	v: "5.7.4",
	fr: 30,
	ip: 0,
	op: 60,
	w: 100,
	h: 100,
	layers: [{ ty: 4, ks: {}, shapes }],
	...extra,
});
const fill = (rgb: number[]) => ({ ty: "fl", c: { a: 0, k: rgb }, o: { a: 0, k: 100 } });
const stroke = (rgb: number[]) => ({ ty: "st", c: { a: 0, k: rgb }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 } });

describe("lottie colours", () => {
	test("hex helpers round-trip", () => {
		expect(normalizeHex("#4c8dff")).toBe("#4C8DFF");
		expect(normalizeHex("abc")).toBe("#AABBCC");
		expect(normalizeHex("#4C8DFFAA")).toBe("#4C8DFF");
		expect(normalizeHex("blue")).toBeNull();
		expect(rgb01ToHex(hexToRgb01("#2EC4B6"))).toBe("#2EC4B6");
		// Some exporters write 0–255.
		expect(rgb01ToHex([255, 0, 128])).toBe("#FF0080");
	});

	test("collects fills, strokes and keyframed colours, most used first", () => {
		const json = doc([
			fill([1, 0, 0, 1]),
			stroke([0, 0, 1, 1]),
			fill([0, 0, 1, 1]),
			{ ty: "fl", c: { a: 1, k: [{ t: 0, s: [0, 1, 0, 1] }, { t: 10, s: [1, 0, 0, 1] }] } },
		]);
		expect(collectLottieColors(json)).toEqual(["#FF0000", "#0000FF", "#00FF00"]);
	});

	test("recolours by authored colour without touching the original", () => {
		const json = doc([fill([1, 0, 0, 1]), stroke([0, 0, 1, 0.5]), { ty: "gr", it: [fill([1, 0, 0, 1])] }]);
		const out = recolorLottie(json, { "#ff0000": "#00ff00", "#0000FF": "#0000ff" });
		expect(collectLottieColors(out).sort()).toEqual(["#0000FF", "#00FF00"]);
		// Alpha is kept.
		const layer = out.layers[0] as { shapes: Array<{ c: { k: number[] } }> };
		expect(layer.shapes[1].c.k[3]).toBe(0.5);
		expect(collectLottieColors(json)).toEqual(["#FF0000", "#0000FF"]);
	});

	test("recolours keyframed colours and solid layers", () => {
		const json = doc([{ ty: "fl", c: { a: 1, k: [{ t: 0, s: [1, 0, 0, 1], e: [1, 0, 0, 1] }, { t: 10, s: [1, 0, 0, 1] }] } }], {
			layers: [
				{ ty: 1, sc: "#ff0000" },
				{ ty: 4, shapes: [{ ty: "fl", c: { a: 1, k: [{ t: 0, s: [1, 0, 0, 1] }, { t: 10, s: [1, 0, 0, 1] }] } }] },
			],
		});
		const out = recolorLottie(json, { "#FF0000": "#123456" });
		expect(collectLottieColors(out)).toEqual(["#123456"]);
		expect((out.layers[0] as { sc: string }).sc).toBe("#123456");
	});

	test("normalizeColorMap drops no-ops and junk", () => {
		expect(normalizeColorMap({ "#fff": "#FFFFFF", "#000": "#111111", red: "#222222" })).toEqual({ "#000000": "#111111" });
	});

	test("detects colour slots for files without metadata", () => {
		const slots = detectColorSlots(doc([fill([1, 1, 1, 1]), fill([1, 1, 1, 1]), stroke([0, 0, 0, 1])]));
		expect(slots).toEqual([
			{ id: "color1", name: "Colour 1", default: "#FFFFFF" },
			{ id: "color2", name: "Colour 2", default: "#000000" },
		]);
	});

	test("text layers and invalid files", () => {
		expect(hasTextLayers(doc([], { layers: [{ ty: 5 }] }))).toBe(true);
		expect(hasTextLayers(doc([], { assets: [{ layers: [{ ty: 5 }] }] }))).toBe(true);
		expect(hasTextLayers(doc([fill([0, 0, 0, 1])]))).toBe(false);
		expect(() => parseLottie('{"hello":1}')).toThrow("isn't a Lottie");
		expect(parseLottie(JSON.stringify(doc([]))).w).toBe(100);
	});
});
