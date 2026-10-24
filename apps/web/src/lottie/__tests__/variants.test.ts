import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePack } from "../../../../../scripts/assets/validate-worksuite-pack";
import { groupPackCategories, type PackIndex, packAssetJsonUrl, packAssetThumbnailUrl, resolvePackVariant, searchPackAssets } from "../catalog";
import { collectLottieColors, hasTextLayers } from "../colors";
import { lottieDataFromPackAsset, switchLottieVariant } from "../element";
import { lottieSourceFromKey, lottieSourceKey } from "../player";
import type { LottieJson, WorksuiteAssetMeta } from "../types";

const packDir = join(import.meta.dir, "..", "..", "..", "..", "..", "assets", "worksuite-pack");
const index = JSON.parse(readFileSync(join(packDir, "index.json"), "utf8")) as PackIndex;
const subscribe = index.assets.filter((a) => a.category === "subscribe-buttons");
const meta = (path: string) => JSON.parse(readFileSync(join(packDir, path, "asset.json"), "utf8")) as WorksuiteAssetMeta;
const withVariants = subscribe.filter((a) => a.variants?.length);

describe("Subscribe buttons pack", () => {
	test("16 assets, shown as “YouTube & subscribe”, 15 in English, Sinhala and Tamil", () => {
		expect(subscribe).toHaveLength(16);
		expect(index.categories.find((c) => c.id === "subscribe-buttons")?.name).toBe("YouTube & subscribe");
		expect(withVariants).toHaveLength(15);
		for (const asset of withVariants) {
			expect(asset.variants?.map((v) => v.id)).toEqual(["en", "si", "ta"]);
			expect(asset.defaultVariant).toBe("en");
		}
	});

	test("search finds them by tags in all three languages", () => {
		for (const q of ["subscribe", "youtube", "bell", "notification", "like", "සබ්ස්ක්‍රයිබ්", "சப்ஸ்கிரைப்"]) {
			expect(searchPackAssets({ assets: subscribe, query: q }).length).toBeGreaterThan(0);
		}
		expect(searchPackAssets({ assets: subscribe, query: "", language: "si" })).toHaveLength(15);
	});

	test.each(subscribe.flatMap((a) => (meta(a.path).variants ?? [{ id: "default", file: `${a.id}.json` }]).map((v) => [`${a.id} ${v.id}`, a, v.file] as const)))(
		"%s: no text layers and every colour is a slot",
		(_name, asset, file) => {
			const text = readFileSync(join(packDir, asset.path, file), "utf8");
			const json = JSON.parse(text) as LottieJson;
			expect(hasTextLayers(json)).toBe(false);
			expect(text.includes('"ty":5')).toBe(false);
			expect(collectLottieColors(json).sort()).toEqual(asset.colors.map((s) => s.default.toUpperCase()).sort());
		},
	);

	test.each(withVariants.map((a) => [a.id, a] as const))("%s: variants share size and timing", (_id, asset) => {
		const m = meta(asset.path);
		const docs = (m.variants ?? []).map((v) => JSON.parse(readFileSync(join(packDir, asset.path, v.file), "utf8")) as LottieJson);
		for (const doc of docs) {
			expect([doc.w, doc.h, doc.fr, doc.ip, doc.op]).toEqual([docs[0].w, docs[0].h, docs[0].fr, docs[0].ip, docs[0].op]);
		}
	});

	test("switching variant keeps colours, speed, loop and timing", () => {
		const asset = withVariants[0];
		const data = { ...lottieDataFromPackAsset(asset), colors: { "#E53935": "#123456" }, speed: 1.5, loop: true };
		expect(data.source).toEqual({ kind: "pack", assetId: asset.id, variant: "en" });
		const si = switchLottieVariant({ data, asset, variant: "si" });
		expect(si.source).toEqual({ kind: "pack", assetId: asset.id, variant: "si" });
		const { source: _a, ...rest } = si;
		const { source: _b, ...before } = data;
		expect(rest).toEqual(before);
		expect(switchLottieVariant({ data, asset, variant: "fr" })).toBe(data);
	});

	test("variant URLs and source keys", () => {
		const asset = withVariants[0];
		expect(packAssetJsonUrl(asset, "en")).toBe(`/worksuite-pack/${asset.path}/${asset.id}.json`);
		expect(packAssetJsonUrl(asset, "ta")).toBe(`/worksuite-pack/${asset.path}/${asset.id}.ta.json`);
		expect(packAssetThumbnailUrl(asset, "si")).toBe(`/worksuite-pack/${asset.path}/thumbnail.si.png`);
		expect(resolvePackVariant(asset, "xx")).toBe("en");
		const source = { kind: "pack" as const, assetId: asset.id, variant: "si" };
		expect(lottieSourceFromKey(lottieSourceKey(source))).toEqual(source);
		expect(lottieSourceFromKey(lottieSourceKey({ kind: "pack", assetId: "x" }))).toEqual({ kind: "pack", assetId: "x" });
	});

	test("the validator catches broken variants", () => {
		const dir = mkdtempSync(join(tmpdir(), "pack-"));
		try {
			const asset = withVariants[0];
			cpSync(join(packDir, asset.path), join(dir, asset.path), { recursive: true });
			const files = Object.keys(asset.files);
			writeFileSync(join(dir, "index.json"), JSON.stringify({ assets: [{ ...asset, files: Object.fromEntries(files.map((f) => [f, asset.files[f]])) }] }));
			expect(validatePack(dir)).toEqual([]);
			const m = meta(asset.path);
			const ta = JSON.parse(readFileSync(join(dir, asset.path, `${asset.id}.ta.json`), "utf8"));
			ta.op += 30;
			ta.layers.push({ ty: 5, ind: 99 });
			writeFileSync(join(dir, asset.path, `${asset.id}.ta.json`), JSON.stringify(ta));
			m.variants = [...(m.variants ?? []), { id: "si", name: "x", lang: "si", file: "nope.json", thumbnail: "nope.png" }];
			writeFileSync(join(dir, asset.path, "asset.json"), JSON.stringify(m));
			const problems = validatePack(dir).join("\n");
			expect(problems).toContain("variant ta: has a text layer");
			expect(problems).toContain("variant ta: length doesn't match");
			expect(problems).toContain("duplicate variant si");
			expect(problems).toContain("missing Lottie JSON");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

const FOLLOW = ["follow-facebook", "follow-tiktok", "follow-instagram"];
const follow = index.assets.filter((a) => FOLLOW.includes(a.category));
const followVariants = follow.filter((a) => a.variants?.length);
// Brand values the pack must not use as defaults.
const BRAND_HEX = ["#1877F2", "#0866FF", "#FE2C55", "#25F4EE", "#E1306C", "#833AB4", "#C13584", "#F77737", "#FCAF45", "#FD1D1D", "#405DE6", "#0095F6"];

describe("Follow buttons pack", () => {
	test("6 assets each under Facebook, TikTok and Instagram, grouped as “Social follow”", () => {
		for (const id of FOLLOW) expect(follow.filter((a) => a.category === id)).toHaveLength(6);
		expect(index.categories.filter((c) => FOLLOW.includes(c.id)).map((c) => [c.name, c.group])).toEqual([
			["Facebook", "Social follow"],
			["TikTok", "Social follow"],
			["Instagram", "Social follow"],
		]);
		const groups = groupPackCategories(index.categories);
		expect(groups[0].group).toBeNull();
		expect(groups.find((g) => g.group === "Social follow")?.categories.map((c) => c.id)).toEqual(FOLLOW);
	});

	test("assets with words come in English, Sinhala and Tamil", () => {
		expect(followVariants).toHaveLength(13);
		for (const asset of followVariants) expect(asset.variants?.map((v) => v.id)).toEqual(["en", "si", "ta"]);
		expect(searchPackAssets({ assets: follow, query: "", language: "ta" })).toHaveLength(13);
		expect(searchPackAssets({ assets: index.assets, query: "", category: "follow-tiktok", language: "si" })).toHaveLength(2);
	});

	test("search finds them by platform and by Sinhala and Tamil words", () => {
		for (const q of ["facebook", "tiktok", "instagram", "follow", "ෆලෝ", "பின்தொடர்", "link in bio", "save"]) {
			expect(searchPackAssets({ assets: follow, query: q }).length).toBeGreaterThan(0);
		}
	});

	test("no brand colours as defaults", () => {
		for (const asset of follow) for (const s of asset.colors) expect(BRAND_HEX).not.toContain(s.default.toUpperCase());
	});

	test.each(follow.flatMap((a) => (meta(a.path).variants ?? [{ id: "default", file: `${a.id}.json` }]).map((v) => [`${a.id} ${v.id}`, a, v.file] as const)))(
		"%s: no text layers and every colour is a slot",
		(_name, asset, file) => {
			const text = readFileSync(join(packDir, asset.path, file), "utf8");
			const json = JSON.parse(text) as LottieJson;
			expect(hasTextLayers(json)).toBe(false);
			expect(text.includes('"ty":5')).toBe(false);
			expect(collectLottieColors(json).sort()).toEqual(asset.colors.map((s) => s.default.toUpperCase()).sort());
			expect([json.fr, json.op / json.fr >= 2, json.op / json.fr <= 4]).toEqual([30, true, true]);
		},
	);

	test.each(followVariants.map((a) => [a.id, a] as const))("%s: variants share size and timing", (_id, asset) => {
		const docs = (meta(asset.path).variants ?? []).map((v) => JSON.parse(readFileSync(join(packDir, asset.path, v.file), "utf8")) as LottieJson);
		for (const doc of docs) expect([doc.w, doc.h, doc.fr, doc.ip, doc.op]).toEqual([docs[0].w, docs[0].h, docs[0].fr, docs[0].ip, docs[0].op]);
	});
});
