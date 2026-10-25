import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { templatesSi } from "../messages/templates-si";
import { templatesTa } from "../messages/templates-ta";
import { translate } from "../translate";

/** Every literal t("…") in the Templates panel, save dialog and online cards. */
function usedStrings(): string[] {
	const dir = join(import.meta.dir, "../../templates/components");
	const out = new Set<string>(["Built-in", "Downloaded", "My templates", "Intro", "Slideshow", "Social", "Promo", "Business", "All"]);
	for (const f of readdirSync(dir)) for (const m of readFileSync(join(dir, f), "utf8").matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) out.add(m[1]!);
	return [...out];
}

describe("Templates translations", () => {
	test("Sinhala and Tamil have the same strings, with placeholders kept", () => {
		expect(Object.keys(templatesSi).sort()).toEqual(Object.keys(templatesTa).sort());
		for (const catalog of [templatesSi, templatesTa]) for (const [en, local] of Object.entries(catalog)) for (const p of en.match(/\{\w+\}/g) ?? []) expect(local).toContain(p);
	});

	test("every string the Templates UI uses is translated", () => {
		for (const locale of ["si", "ta"] as const) expect(usedStrings().filter((k) => translate({ text: k, locale }) === k)).toEqual([]);
	});
});
