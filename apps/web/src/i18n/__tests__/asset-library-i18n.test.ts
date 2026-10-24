import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assetLibrarySi } from "../messages/asset-library-si";
import { assetLibraryTa } from "../messages/asset-library-ta";
import { translate } from "../translate";
import { PACK_TYPE_LABELS } from "@/asset-library/types";
import { STATUS_LABELS } from "@/asset-library/catalog";

/** Every literal t("…") in the Asset Library UI and the timeline drop code. */
function usedStrings(): string[] {
	const root = join(import.meta.dir, "../..");
	const files = [
		...readdirSync(join(root, "asset-library/components")).map((f) => join(root, "asset-library/components", f)),
		join(root, "asset-library/apply-pack.ts"),
	];
	const out = new Set<string>();
	for (const file of files) {
		const src = readFileSync(file, "utf8");
		for (const m of src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) out.add(m[1]);
		for (const m of src.matchAll(/text="([^"]*)"/g)) out.add(m[1]);
	}
	return [...out];
}

describe("Asset Library translations", () => {
	test("Sinhala and Tamil have the same strings, with placeholders kept", () => {
		expect(Object.keys(assetLibrarySi).sort()).toEqual(Object.keys(assetLibraryTa).sort());
		for (const catalog of [assetLibrarySi, assetLibraryTa])
			for (const [en, local] of Object.entries(catalog)) {
				for (const p of en.match(/\{\w+\}/g) ?? []) expect(local).toContain(p);
				expect(local.trim().length).toBeGreaterThan(0);
			}
	});

	test("every string the UI uses is translated", () => {
		const keys = [...usedStrings(), ...Object.values(PACK_TYPE_LABELS), ...Object.values(STATUS_LABELS), "Downloaded"];
		const missing = keys.filter((k) => translate({ text: k, locale: "si" }) === k && !/^(Pro|LUTs)$/.test(k));
		expect(missing).toEqual([]);
		const missingTa = keys.filter((k) => translate({ text: k, locale: "ta" }) === k && !/^(Pro)$/.test(k));
		expect(missingTa).toEqual([]);
	});

	test("Sinhala and Tamil text is in their scripts", () => {
		expect(translate({ text: "Download & Add", locale: "si" })).toMatch(/[඀-෿]/);
		expect(translate({ text: "Download & Add", locale: "ta" })).toMatch(/[஀-௿]/);
		expect(translate({ text: "Downloading {name}… {pct}%", locale: "ta", vars: { name: "X", pct: 40 } })).toBe("X பதிவிறக்குகிறது… 40%");
	});
});
