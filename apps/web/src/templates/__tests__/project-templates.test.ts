import { describe, expect, test } from "bun:test";
import { IN_ANIMATIONS, OUT_ANIMATIONS, COMBO_ANIMATIONS } from "@/animation/clip-animation";
import { PROJECT_TEMPLATES, templateDuration, templateSlots } from "../project-templates";

const known = {
	"animation.in": new Set(IN_ANIMATIONS.map((a) => a.value)),
	"animation.out": new Set(OUT_ANIMATIONS.map((a) => a.value)),
	"animation.combo": new Set(COMBO_ANIMATIONS.map((a) => a.value)),
};

describe("project templates", () => {
	test("ids are unique", () => {
		const ids = PROJECT_TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("slide counts and durations", () => {
		const reel = PROJECT_TEMPLATES.find((t) => t.id === "reel-hook");
		expect(reel && templateSlots(reel)).toBe(3);
		expect(reel && templateDuration(reel)).toBe(6);
	});

	test("every animation a template uses exists", () => {
		for (const template of PROJECT_TEMPLATES) {
			for (const layer of template.layers) {
				const params = layer.kind === "text" ? layer.style : (layer.animation ?? {});
				for (const [key, values] of Object.entries(known)) {
					if (key in params) expect(values.has(String(params[key]))).toBe(true);
				}
			}
		}
	});

	test("layers fit inside the template", () => {
		for (const template of PROJECT_TEMPLATES) {
			for (const layer of template.layers) {
				expect(layer.start).toBeGreaterThanOrEqual(0);
				expect(layer.duration).toBeGreaterThan(0);
			}
		}
	});
});
