import { describe, expect, test } from "bun:test";
import { BUILT_IN_TEMPLATES, cloneProject, projectColors, replaceColor, replaceFont, searchTemplates, TEMPLATE_CATEGORIES } from "../templates";

describe("motion templates", () => {
	test("every category has templates and every template builds", () => {
		for (const c of TEMPLATE_CATEGORIES) expect(BUILT_IN_TEMPLATES.filter((t) => t.category === c).length).toBeGreaterThanOrEqual(2);
		for (const t of BUILT_IN_TEMPLATES) {
			const p = t.build();
			expect(p.layers.length).toBeGreaterThan(0);
			for (const l of p.layers) for (const keys of Object.values(l.keyframes)) for (const k of keys ?? []) expect(k.t).toBeLessThanOrEqual(p.duration + 1e-6);
		}
		expect(new Set(BUILT_IN_TEMPLATES.map((t) => t.id)).size).toBe(BUILT_IN_TEMPLATES.length);
	});

	test("search by words and category", () => {
		expect(searchTemplates({ templates: BUILT_IN_TEMPLATES, query: "youtube", category: null }).map((t) => t.id)).toContain("subscribe-pill");
		expect(searchTemplates({ templates: BUILT_IN_TEMPLATES, query: "", category: "Transitions" })).toHaveLength(2);
	});

	test("clone gives new ids; colours and fonts replace everywhere", () => {
		const p = BUILT_IN_TEMPLATES.find((t) => t.id === "social-story-promo")?.build();
		if (!p) throw new Error("missing");
		const c = cloneProject({ source: p });
		expect(c.id).not.toBe(p.id);
		expect(c.layers.map((l) => l.id)).not.toEqual(p.layers.map((l) => l.id));
		expect(projectColors(p)).toContain("#F59E0B");
		const recoloured = replaceColor({ project: p, from: "#f59e0b", to: "#00FF00" });
		expect(projectColors(recoloured)).not.toContain("#F59E0B");
		expect(replaceFont({ project: p, from: "Inter", to: "Poppins" }).layers.filter((l) => l.kind === "text").every((l) => l.kind === "text" && l.fontFamily === "Poppins")).toBe(true);
	});
});
