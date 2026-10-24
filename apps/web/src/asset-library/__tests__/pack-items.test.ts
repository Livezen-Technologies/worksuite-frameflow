import { describe, expect, test } from "bun:test";
import {
	isMediaItem,
	parseBrandKit,
	effectStackParser,
	parseFilter,
	parseProjectTemplate,
	parseTextTemplate,
	parseTransition,
} from "../pack-items";
import type { PackContentItem } from "../registry";

const item = (file = "x/item.json"): PackContentItem => ({ id: "pack/item", name: "Item", url: `wsc-asset://pack/1.0.0/${file}`, packId: "pack", raw: {} });

describe("downloaded pack presets", () => {
	test("transitions keep known types and fill defaults", () => {
		expect(parseTransition({ raw: { name: "Glitch push", value: { type: "push", duration: 9, direction: "up" } }, item: item() })).toEqual({
			id: "pack/item",
			name: "Glitch push",
			value: { type: "push", duration: 5, easing: "ease-in-out", direction: "up", alignment: "center" },
		});
		expect(parseTransition({ raw: { value: { type: "shader-melt" } }, item: item() })).toBeNull();
	});

	test("filters need a grade; effect stacks drop unknown effects", () => {
		expect(parseFilter({ raw: { name: "Warm", grade: { temperature: 20, junk: {} } }, item: item() })).toEqual({ id: "pack/item", name: "Warm", grade: { temperature: 20 } });
		expect(parseFilter({ raw: { grade: {} }, item: item() })).toBeNull();
		const stack = effectStackParser({ knownType: (t) => t === "blur" })({ raw: { effects: [{ type: "blur", params: { radius: 4 } }, { type: "nope" }] }, item: item() });
		expect(stack?.effects).toEqual([{ type: "blur", params: { radius: 4 }, enabled: true }]);
		expect(effectStackParser({ knownType: () => false })({ raw: { effects: [{ type: "nope" }] }, item: item() })).toBeNull();
	});

	test("text and video templates are checked", () => {
		expect(parseTextTemplate({ raw: { name: "Title", params: { content: "Hello", fontSize: 80 } }, item: item() })?.params.content).toBe("Hello");
		expect(parseTextTemplate({ raw: { params: { fontSize: 80 } }, item: item() })).toBeNull();
		const template = parseProjectTemplate({ raw: { name: "Promo", aspect: { width: 1080, height: 1920 }, layers: [{ kind: "media", slot: 0, start: 0, duration: 3, color: "#000" }] }, item: item() });
		expect(template?.aspect.label).toBe("9:16");
		expect(template?.category).toBe("Promo");
		expect(parseProjectTemplate({ raw: { aspect: { width: 1, height: 1 }, layers: [{ kind: "script", start: 0, duration: 1 }] }, item: item() })).toBeNull();
	});

	test("brand kits: hex colours and logos inside the pack only", () => {
		const kit = parseBrandKit({ raw: { name: "Livezen", colors: [{ hex: "#4c8dff" }, "#fff", "#0F172A"], logos: ["logo.png", "../evil.png", "https://x/y.png"] }, item: item("kit/kit.json") });
		expect(kit?.colors).toEqual(["#4C8DFF", "#0F172A"]);
		expect(kit?.logos).toEqual([{ name: "logo.png", url: "wsc-asset://pack/1.0.0/kit/logo.png" }]);
	});

	test("media items are images or video", () => {
		expect(isMediaItem(item("a/a.png"))).toBe(true);
		expect(isMediaItem(item("a/a.cube"))).toBe(false);
	});
});
