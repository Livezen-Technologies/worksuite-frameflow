import { describe, expect, test } from "bun:test";
import { createTextAnimation, defaultPhase } from "@/text-animation/evaluate";
import { recordingContext } from "@/text-animation/__tests__/mock-context";
import type { TextAnimationStyle } from "@/text-animation/types";
import { hideLayerPaint } from "../../slots";
import type { LottieJson } from "../../types";
import { ensureFflate } from "./fflate-shim";

ensureFflate();
const { addColorSlots, readDotLottie, writeDotLottie, writeDotLottieV1 } = await import("../dotlottie");
const { chooseExportMode, exportedText, exportTextAnimationToLottie } = await import("../export-text");
const { readLottieFile, textLayersToSlots } = await import("../import");

const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function sample(): LottieJson {
	return {
		v: "5.12.2",
		fr: 25,
		ip: 0,
		op: 75,
		w: 640,
		h: 360,
		nm: "Sample",
		assets: [{ id: "img0", w: 1, h: 1, u: "", p: PNG_1PX, e: 1 }],
		fonts: { list: [{ fName: "Inter-Bold", fFamily: "Inter", fStyle: "Bold" }] },
		layers: [
			{
				ty: 5,
				nm: "Headline",
				ind: 1,
				ip: 0,
				op: 75,
				ks: { p: { a: 0, k: [320, 180, 0] } },
				t: { d: { k: [{ t: 0, s: { t: "Hello world", f: "Inter-Bold", s: 48, fc: [1, 0.8, 0], j: 2 } }] } },
			},
			{ ty: 2, nm: "pic", refId: "img0", ind: 2, ip: 0, op: 75, ks: {} },
			{ ty: 4, nm: "bg", ind: 3, ip: 0, op: 75, ks: {}, shapes: [{ ty: "rc" }, { ty: "fl", c: { a: 0, k: [0.2, 0.4, 0.8, 1] }, o: { a: 0, k: 100 } }] },
		],
	};
}

describe("dotLottie", () => {
	test("v2 write → read keeps animations, images and themes", () => {
		const bytes = writeDotLottie({ animations: [{ id: "main", name: "Main", json: sample() }, { id: "alt", json: { ...sample(), nm: "Alt" } }], themes: [{ id: "dark", colors: { color1: "#112233" } }] });
		const dot = readDotLottie(bytes);
		expect(dot.version).toBe(2);
		expect(dot.animations.map((a) => a.id)).toEqual(["main", "alt"]);
		const asset = (dot.animations[0]!.json.assets as Array<{ p: string; e: number }>)[0]!;
		expect(asset.p).toBe(PNG_1PX);
		expect(asset.e).toBe(1);
		expect(dot.themes[0]!.rules[0]).toEqual({ id: "color1", type: "Color", value: [0x11 / 255, 0x22 / 255, 0x33 / 255, 1] });
		// Deterministic bytes.
		expect(writeDotLottie({ animations: [{ id: "main", json: sample() }] })).toEqual(writeDotLottie({ animations: [{ id: "main", json: sample() }] }));
	});
	test("v1 archives read", () => {
		const dot = readDotLottie(writeDotLottieV1({ animations: [{ id: "a1", json: sample() }] }));
		expect(dot.version).toBe(1);
		expect(dot.animations[0]!.json.fr).toBe(25);
	});
	test("colour slots get sid + slots table", () => {
		const json = addColorSlots(sample(), { "#3366CC": "brand" });
		expect(JSON.stringify(json)).toContain('"sid":"brand"');
		expect((json.slots as Record<string, unknown>).brand).toBeDefined();
	});
});

describe("import", () => {
	test("text layers become editable slots", () => {
		const { json, slots } = textLayersToSlots(sample());
		expect(slots).toHaveLength(1);
		expect(slots[0]!.defaults.en).toBe("Hello world");
		expect(slots[0]!.fontFamily).toBe("Inter");
		expect(slots[0]!.fontWeight).toBe(700);
		expect(slots[0]!.align).toBe("center");
		expect((json.layers as Array<{ nm: string }>)[0]!.nm).toBe("slot:text:headline");
		// When overridden, the authored words are blanked but the layer stays.
		const hidden = hideLayerPaint(json, { paint: ["slot:text:headline"] });
		expect(JSON.stringify(hidden.layers[0])).toContain('"t":""');
	});
	test("JSON and .lottie with several animations", () => {
		const json = readLottieFile({ name: "x.json", bytes: new TextEncoder().encode(JSON.stringify(sample())) });
		expect(json).toHaveLength(1);
		expect(json[0]!.textSlots).toHaveLength(1);
		expect(json[0]!.colors.some((c) => c.default === "#FFCC00")).toBe(true);
		const slot = json[0]!.textSlots[0]!;
		expect(json[0]!.colors.find((c) => c.id === slot.color)?.default).toBe("#FFCC00");
		const many = readLottieFile({ name: "pack.lottie", bytes: writeDotLottie({ animations: [{ id: "a", json: sample() }, { id: "b", json: sample() }] }) });
		expect(many.map((m) => m.name)).toEqual(["pack — a", "pack — b"]);
	});
});

describe("export and round trip", () => {
	const style: TextAnimationStyle = { fontFamily: "Inter", fontWeight: 700, fontSize: 64, tracking: 0, lineHeight: 1.2, align: "center", fill: "#FF3B6B" };
	const animation = createTextAnimation({ unit: "word", in: { ...defaultPhase("rise"), stagger: 0.1 }, out: defaultPhase("fade", "out") });

	test("mode choice: Sinhala and non-text-layer effects go to images", () => {
		expect(chooseExportMode({ text: "Hello", animation, mode: "auto" })).toBe("text-layers");
		expect(chooseExportMode({ text: "ආයුබෝවන්", animation, mode: "auto" })).toBe("images");
		expect(chooseExportMode({ text: "Hello", animation: createTextAnimation({ unit: "word", in: defaultPhase("blur-in") }), mode: "auto" })).toBe("images");
	});

	test("Latin text layers: export → .lottie → import keeps duration, fps, colours and words", async () => {
		const { ctx } = recordingContext();
		const json = await exportTextAnimationToLottie({ text: "Big summer sale", style, animation, duration: 3, fps: 30, width: 1280, height: 720, ctx });
		expect(json.layers.filter((l) => (l as { ty: number }).ty === 5)).toHaveLength(3);
		const [back] = readLottieFile({ name: "out.lottie", bytes: writeDotLottie({ animations: [{ id: "text", json }] }) });
		expect(back!.json.fr).toBe(30);
		expect((back!.json.op - back!.json.ip) / back!.json.fr).toBe(3);
		expect(back!.colors.map((c) => c.default)).toContain("#FF3B6B");
		expect(exportedText(back!.json)).toBe("Big summer sale");
		expect(back!.textSlots.map((s) => s.defaults.en)).toEqual(["Big", "summer", "sale"]);
	});

	test("Sinhala as engine-drawn image frames: round trip keeps timing and text", async () => {
		let calls = 0;
		const json = await exportTextAnimationToLottie({
			text: "ශ්‍රී ලංකා",
			style,
			animation,
			duration: 2,
			fps: 24,
			width: 320,
			height: 180,
			sampleFps: 12,
			rasterize: (t) => {
				calls++;
				return t < 1 ? `${PNG_1PX.slice(0, -2)}${calls % 2 ? "==" : "=="}` : PNG_1PX;
			},
			background: { ...sample(), layers: [sample().layers[2]!] },
		});
		expect(calls).toBe(24);
		expect(json.layers.some((l) => (l as { ty: number }).ty === 2)).toBe(true);
		expect(json.layers.some((l) => (l as { ty: number }).ty === 0)).toBe(true);
		const [back] = readLottieFile({ name: "si.lottie", bytes: writeDotLottie({ animations: [{ id: "si", json }] }) });
		expect(back!.json.fr).toBe(24);
		expect(back!.json.op).toBe(48);
		expect(exportedText(back!.json)).toBe("ශ්‍රී ලංකා");
		expect(back!.colors.map((c) => c.default)).toContain("#3366CC");
	});
});

describe("multi-animation pick", async () => {
	const { parsePick } = await import("../pick");
	test("numbers, ranges, blank = all", () => {
		const c = ["a", "b", "c", "d"];
		expect(parsePick("", c)).toEqual(c);
		expect(parsePick("1, 3", c)).toEqual(["a", "c"]);
		expect(parsePick("2-4", c)).toEqual(["b", "c", "d"]);
		expect(parsePick("9", c)).toEqual([]);
	});
});
