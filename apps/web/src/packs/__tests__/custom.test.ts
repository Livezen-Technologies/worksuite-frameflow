import { describe, expect, test } from "bun:test";
import { compilePackTemplate } from "../compile";
import { newPack, packToFile, parsePackFile, templateFromElements } from "../custom";

const TPS = 120000;
const frame = { width: 1920, height: 1080 };

function fakeEditor() {
	const elements = [
		{ id: "t", type: "text", startTime: 2 * TPS, duration: 3 * TPS, params: { content: "Hello", fontSize: 20, color: "#ff0000", "transform.positionX": 480, "transform.positionY": -270, fontFamily: "Inter" } },
		{ id: "s", type: "graphic", definitionId: "rectangle", startTime: 2 * TPS, duration: 3 * TPS, params: { fill: "#00ff00", "transform.scaleX": 0.5, "transform.scaleY": 0.25, "transform.positionX": 0, "transform.positionY": 0 } },
	];
	return {
		selection: { getSelectedElements: () => elements.map((e) => ({ trackId: "x", elementId: e.id })) },
		timeline: { getElementsWithTracks: () => elements.map((element) => ({ track: { id: "x" }, element })) },
		project: { getActive: () => ({ settings: { canvasSize: frame } }) },
	};
}

describe("custom packs (SP-11)", () => {
	test("selection → template → compiled keeps place, size and timing", async () => {
		const pack = newPack({ name: "Team" });
		const editor = fakeEditor();
		const template = templateFromElements({
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- partial test elements
			elements: editor.timeline.getElementsWithTracks().map((f) => f.element) as never,
			frame,
			ticksPerSecond: TPS,
			pack,
			name: "Promo",
			aspect: "16:9",
		});
		if (!template) throw new Error("no template");
		expect(template.layers.map((l) => l.start)).toEqual([0, 0]);
		const compiled = compilePackTemplate({ pack, template, aspect: "16:9", language: "en" });
		const text = compiled.layers.find((l) => l.kind === "text");
		const shape = compiled.layers.find((l) => l.kind === "shape");
		if (text?.kind !== "text" || shape?.kind !== "shape") throw new Error("layers");
		expect(text.x).toBeCloseTo(0.25, 3);
		expect(text.y).toBeCloseTo(-0.25, 3);
		expect(Number(text.style.fontSize)).toBeCloseTo(20, 1);
		expect(text.style.color).toBe("#ff0000");
		expect(text.content).toBe("Hello");
		expect(shape.fill).toBe("#00ff00");
		// Back to the editor's scale: width × 1920 / 1080 = 0.5.
		expect((shape.width * frame.width) / 1080).toBeCloseTo(0.5, 3);
		expect(text.duration).toBe(3);
	});

	test("pack files round-trip and reject other JSON", async () => {
		const pack = { ...newPack({ name: "Team" }), templates: [] };
		const text = await packToFile({ pack }).text();
		expect(parsePackFile({ text }).name).toBe("Team");
		expect(() => parsePackFile({ text: JSON.stringify({ hello: 1 }) })).toThrow();
	});
});
