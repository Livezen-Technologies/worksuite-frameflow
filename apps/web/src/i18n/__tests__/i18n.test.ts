import { describe, expect, test } from "bun:test";
import { translate } from "../translate";
import { si } from "../messages/si";
import { ta } from "../messages/ta";
import { detectLocale, LOCALES } from "../locales";
import { CATALOGS } from "../translate";

describe("interface translations", () => {
	test("Sinhala and Tamil cover the same strings", () => {
		const keys = new Set([...Object.keys(si), ...Object.keys(ta)]);
		const missing = [...keys].filter((k) => !(k in si) || !(k in ta));
		expect(missing.length / keys.size).toBeLessThanOrEqual(0.02);
	});

	test("every locale has a catalog that misses at most 2% of strings", () => {
		const keys = Object.keys(si);
		for (const { code } of LOCALES) {
			if (code === "en") continue;
			const catalog = CATALOGS[code];
			const missing = keys.filter((k) => !(k in catalog));
			expect(missing.length / keys.length).toBeLessThanOrEqual(0.02);
			for (const [en, local] of Object.entries(catalog))
				for (const p of en.match(/\{\w+\}/g) ?? []) expect(local).toContain(p);
		}
	});

	test("right-to-left locales are marked", () => {
		const rtl = LOCALES.filter((l) => l.dir === "rtl")
			.map((l) => l.code)
			.sort();
		expect(rtl).toEqual(["ar", "fa", "he", "ur"]);
		expect(detectLocale(["ar-EG"])).toBe("ar");
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
		expect(detectLocale(["fr"])).toBe("fr");
		expect(detectLocale(["xx"])).toBe("en");
	});
});
