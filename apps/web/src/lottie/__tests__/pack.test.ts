import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validatePack } from "../../../../../scripts/assets/validate-worksuite-pack";
import type { PackIndex } from "../catalog";
import { collectLottieColors, hasTextLayers, recolorLottie } from "../colors";
import type { LottieJson, WorksuiteAssetMeta } from "../types";

const packDir = join(import.meta.dir, "..", "..", "..", "..", "..", "assets", "worksuite-pack");
const index = JSON.parse(readFileSync(join(packDir, "index.json"), "utf8")) as PackIndex;
const load = (asset: PackIndex["assets"][number]) => ({
	meta: JSON.parse(readFileSync(join(packDir, asset.path, "asset.json"), "utf8")) as WorksuiteAssetMeta,
	json: JSON.parse(readFileSync(join(packDir, asset.path, `${asset.id}.json`), "utf8")) as LottieJson,
});

describe("Worksuite Assets pack", () => {
	test("passes the pack validator", () => {
		expect(validatePack(packDir)).toEqual([]);
	});

	test("has 76 assets across the eight categories", () => {
		const counts = Object.fromEntries(index.categories.map((c) => [c.id, c.count]));
		expect(counts).toEqual({
			"lower-thirds": 10,
			"call-to-action": 10,
			callouts: 10,
			reactions: 8,
			"sri-lanka-seasonal": 6,
			transitions: 8,
			"status-infographics": 8,
			"subscribe-buttons": 16,
		});
		expect(index.assets).toHaveLength(76);
	});

	test.each(index.assets.map((a) => [a.id, a] as const))("%s: metadata, size and colours", (_id, asset) => {
		const { meta, json } = load(asset);
		expect(meta.schema).toBe(1);
		expect(meta.license).toBe("MIT");
		expect(meta.type).toBe("lottie");
		expect(json.fr).toBe(30);
		expect(hasTextLayers(json)).toBe(false);
		expect(statSync(join(packDir, asset.path, `${asset.id}.json`)).size).toBeLessThan(150 * 1024);
		const slots = meta.colors.map((s) => s.default.toUpperCase());
		expect(new Set(slots).size).toBe(slots.length);
		expect(collectLottieColors(json).sort()).toEqual([...slots].sort());
	});

	test.each(index.assets.map((a) => [a.id, a] as const))("%s: every colour can be recoloured", (_id, asset) => {
		const { meta, json } = load(asset);
		const replacements = ["#010203", "#040506", "#070809", "#0A0B0C", "#0D0E0F", "#101112", "#131415", "#161718"];
		const map = Object.fromEntries(meta.colors.map((s, i) => [s.default, replacements[i]]));
		const recoloured = recolorLottie(json, map);
		expect(collectLottieColors(recoloured).sort()).toEqual(replacements.slice(0, meta.colors.length).sort());
	});
});
