import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTextAnimation, defaultPhase } from "@/text-animation/evaluate";
import { applyPresetToClips, presetPatches, presetStyleParams, resetPatches } from "@/text-animation/presets";
import { animationProblems, itemProblems, packIndexProblems, searchItems, type TextLibraryItem, type TextPackIndex } from "../manifest";
import { pushRecent } from "../recent";
import { combinePacks } from "../library-content";

const packsDir = join(import.meta.dir, "..", "..", "..", "..", "..", "assets", "packs");

function loadPack(type: string, id: string): TextPackIndex {
	const dir = join(packsDir, type, id);
	const manifest = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));
	const categories = JSON.parse(readFileSync(join(dir, "categories.json"), "utf8"));
	const items = readdirSync(join(dir, "items")).sort().map((f) => JSON.parse(readFileSync(join(dir, "items", f), "utf8")) as TextLibraryItem);
	return { schema: 1, type: manifest.type, id: manifest.id, version: manifest.version, name: manifest.title, categories, items };
}

const allPacks = () =>
	(["text-animations", "text-templates"] as const).flatMap((type) =>
		readdirSync(join(packsDir, type))
			.filter((id) => !id.includes("."))
			.map((id) => loadPack(type, id)),
	);

describe("library manifests", () => {
	test("every shipped text pack is valid (run this after adding Stage 2 content)", () => {
		const packs = allPacks();
		expect(packs.length).toBeGreaterThanOrEqual(2);
		for (const pack of packs) expect(packIndexProblems(pack)).toEqual([]);
		const content = combinePacks(packs);
		expect(content.animations.length).toBeGreaterThanOrEqual(12);
		expect(content.templates.length).toBeGreaterThanOrEqual(8);
	});
	test("catches bad items", () => {
		expect(animationProblems({ version: 1, unit: "word", in: { ...defaultPhase("fade"), effect: "nope" } })[0]).toContain("isn't a registered effect");
		expect(animationProblems({ version: 1, unit: "word", in: { ...defaultPhase("fade"), easing: "wobbly" } }).join()).toContain("unknown easing");
		expect(itemProblems({ schema: 1, id: "Bad Id", kind: "animation", name: { en: "x" }, category: "c", tags: { en: [], si: [], ta: [] }, animation: createTextAnimation() }).join()).toContain("id must be");
		expect(itemProblems({ schema: 1, id: "tpl", kind: "template", name: { en: "x" }, category: "c", tags: { en: [], si: [] }, duration: 2, slots: [{ id: "a", text: { en: "x" }, x: 2, y: 0.5, size: 0.1 }] }).join()).toContain("x must be 0–1");
	});
	test("search matches Sinhala and Tamil tags", () => {
		const { animations } = combinePacks(allPacks());
		expect(searchItems(animations, "typewriter").map((i) => i.id)).toContain("typewriter-caret");
		expect(searchItems(animations, "යතුරුලියනය").map((i) => i.id)).toContain("typewriter-caret");
		expect(searchItems(animations, "தட்டச்சு").map((i) => i.id)).toContain("typewriter-caret");
		expect(searchItems(animations, "neon glow").map((i) => i.id)).toEqual(["neon-sign"]);
	});
	test("recently used keeps order and limit", () => {
		let r: string[] = [];
		for (let i = 0; i < 30; i++) r = pushRecent(r, `a${i % 26}`);
		expect(r[0]).toBe("a3");
		expect(r.length).toBe(24);
		expect(new Set(r).size).toBe(r.length);
	});
});

describe("presets", () => {
	const animation = createTextAnimation({ unit: "grapheme", in: defaultPhase("pop") });
	const preset = { animation, params: presetStyleParams({ content: "secret", color: "#FF0000", fontFamily: "Inter" }) };
	test("keeps style, never the words", () => {
		expect(preset.params).toEqual({ color: "#FF0000", fontFamily: "Inter" });
	});
	test("apply to all selected clips in one undo step, then undo/reset", () => {
		type Clip = { id: string; params: Record<string, unknown>; textAnimation?: unknown };
		let clips: Clip[] = [
			{ id: "a", params: { content: "one", color: "#FFFFFF" } },
			{ id: "b", params: { content: "two", color: "#00FF00" } },
		];
		const history: Clip[][] = [];
		const editor = {
			timeline: {
				updateElements: ({ updates }: { updates: Array<{ elementId: string; patch: Record<string, unknown> }> }) => {
					history.push(clips);
					clips = clips.map((c) => {
						const u = updates.find((x) => x.elementId === c.id);
						return u ? { ...c, ...u.patch } : c;
					});
				},
			},
		};
		applyPresetToClips({ editor, preset, targets: clips.map((c) => ({ trackId: "t", elementId: c.id, params: c.params })) });
		expect(history).toHaveLength(1);
		expect(clips.every((c) => JSON.stringify(c.textAnimation) === JSON.stringify(animation))).toBe(true);
		expect(clips.map((c) => c.params.content)).toEqual(["one", "two"]);
		expect(clips.map((c) => c.params.color)).toEqual(["#FF0000", "#FF0000"]);
		// Undo restores both clips at once.
		clips = history.pop()!;
		expect(clips.every((c) => c.textAnimation === undefined)).toBe(true);
		expect(clips[1]!.params.color).toBe("#00FF00");
		// Patches are independent copies.
		const patches = presetPatches({ preset, targets: [{ trackId: "t", elementId: "a", params: {} }] });
		expect(patches[0]!.patch.textAnimation).not.toBe(animation);
		expect(resetPatches([{ trackId: "t", elementId: "a" }])[0]!.patch.textAnimation).toBeUndefined();
	});
});

describe("JSON Schema", () => {
	test("assets/packs/text-pack-item.schema.json lists every registered effect and easing", async () => {
		const { TEXT_EFFECT_IDS } = await import("@/text-animation/effects");
		const { EASING_NAMES } = await import("@/text-animation/easing");
		const schema = JSON.parse(readFileSync(join(packsDir, "text-pack-item.schema.json"), "utf8"));
		expect(schema.$defs.phase.properties.effect.enum).toEqual(["none", ...TEXT_EFFECT_IDS]);
		expect(schema.$defs.easing.oneOf[0].enum).toEqual(EASING_NAMES);
	});
});
