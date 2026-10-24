import { describe, expect, test } from "bun:test";
import { getDefaultShortcuts } from "../definitions";
import { KEYBINDING_PRESETS, presetKeybindings } from "../keybinding-presets";
import { v8ToV9 } from "../keybindings/migrations/v8-to-v9";

describe("keyboard shortcuts", () => {
	test("presets move actions to their keys without leaving duplicates", () => {
		for (const p of KEYBINDING_PRESETS) {
			const map = presetKeybindings({ id: p.id });
			for (const [action, keys] of p.overrides) for (const key of keys) expect(map.get(key)).toBe(action);
		}
		const premiere = presetKeybindings({ id: "premiere" });
		expect(premiere.get("ctrl+k")).toBe("split");
		expect(premiere.get("s")).toBe("toggle-snapping");
		expect([...premiere].filter(([, a]) => a === "split")).toHaveLength(1);
	});

	test("defaults include the new shortcuts", () => {
		const d = getDefaultShortcuts();
		expect(d.get("=")).toBe("timeline-zoom-in");
		expect(d.get("ctrl+/")).toBe("open-shortcuts");
		expect(d.get("m")).toBe("toggle-bookmark");
	});

	test("migration adds new shortcuts only where the key and action are free", () => {
		const out = JSON.parse(JSON.stringify(v8ToV9({ state: { isCustomized: true, keybindings: { m: "split", space: "toggle-play" } } })));
		expect(out.keybindings.m).toBe("split");
		expect(out.keybindings["="]).toBe("timeline-zoom-in");
		expect(out.keybindings["shift+m"]).toBe("toggle-elements-muted-selected");
	});
});
