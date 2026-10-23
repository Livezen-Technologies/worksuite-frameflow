import { describe, expect, test } from "bun:test";
import { translate } from "../translate";
import { si } from "../messages/si";
import { ta } from "../messages/ta";
import { detectLocale } from "../locales";

describe("interface translations", () => {
	test("Sinhala and Tamil cover the same strings", () => {
		const keys = new Set([...Object.keys(si), ...Object.keys(ta)]);
		const missing = [...keys].filter((k) => !(k in si) || !(k in ta));
		expect(missing.length / keys.size).toBeLessThanOrEqual(0.02);
	});

	test("placeholders survive translation", () => {
		for (const catalog of [si, ta])
			for (const [en, local] of Object.entries(catalog))
				for (const p of en.match(/\{\w+\}/g) ?? []) expect(local).toContain(p);
	});

	test("lookup, fallback and interpolation", () => {
		expect(translate({ text: "Export", locale: "si" })).toBe("අපනයනය");
		expect(translate({ text: "Not catalogued", locale: "ta" })).toBe(
			"Not catalogued",
		);
		expect(
			translate({
				text: "Workspace: {name}",
				locale: "ta",
				vars: { name: "X" },
			}),
		).toBe("பணியிடம்: X");
	});

	test("detects the system language", () => {
		expect(detectLocale(["si-LK"])).toBe("si");
		expect(detectLocale(["ta-IN", "en"])).toBe("ta");
		expect(detectLocale(["fr"])).toBe("en");
	});
});
