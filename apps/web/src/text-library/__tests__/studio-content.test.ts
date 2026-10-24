import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTextEffect } from "@/text-animation/effects";
import { phaseSpan } from "@/text-animation/evaluate";
import { packIndexProblems, searchItems, type TextLibraryAnimation, type TextLibraryItem, type TextLibraryTemplate, type TextPackIndex } from "../manifest";
import { combinePacks } from "../library-content";

// The generated "studio" packs (scripts/assets/generate-text-content.mjs).
const repo = join(import.meta.dir, "..", "..", "..", "..", "..");
const packsDir = join(repo, "assets", "packs");

function loadPack(type: string, id: string): TextPackIndex {
	const dir = join(packsDir, type, id);
	const manifest = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));
	const categories = JSON.parse(readFileSync(join(dir, "categories.json"), "utf8"));
	const items = readdirSync(join(dir, "items")).sort().map((f) => JSON.parse(readFileSync(join(dir, "items", f), "utf8")) as TextLibraryItem);
	return { schema: 1, type: manifest.type, id: manifest.id, version: manifest.version, name: manifest.title, categories, items };
}

const animPack = loadPack("text-animations", "worksuite-text-animations-studio");
const tplPack = loadPack("text-templates", "worksuite-text-templates-studio");
const animations = animPack.items as TextLibraryAnimation[];
const templates = tplPack.items as TextLibraryTemplate[];
const allPacks = (["text-animations", "text-templates"] as const).flatMap((type) =>
	readdirSync(join(packsDir, type))
		.filter((id) => !id.includes("."))
		.map((id) => loadPack(type, id)),
);
const phases = (a: TextLibraryAnimation["animation"]) => (["in", "emphasis", "out"] as const).flatMap((w) => (a[w] ? [[w, a[w]!] as const] : []));
const units = (text: string, unit: string) =>
	unit === "block" ? 1 : unit === "line" ? text.split("\n").length : unit === "word" ? text.trim().split(/\s+/).length : [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text.replace(/\s+/g, ""))].length;

describe("studio text content", () => {
	test("exactly 250 new animations and 250 new templates, all valid", () => {
		expect(animations).toHaveLength(250);
		expect(templates).toHaveLength(250);
		expect(packIndexProblems(animPack)).toEqual([]);
		expect(packIndexProblems(tplPack)).toEqual([]);
	});

	test("ids are unique across every shipped text pack", () => {
		const seen = new Map<string, string>();
		for (const pack of allPacks)
			for (const item of pack.items) {
				const key = `${item.kind}:${item.id}`;
				expect(seen.get(key)).toBeUndefined();
				seen.set(key, pack.id);
			}
		const combined = combinePacks(allPacks);
		expect(combined.animations.length).toBe(allPacks.filter((p) => p.type === "text-animations").reduce((n, p) => n + p.items.length, 0));
	});

	test("every category is used and every item's category exists", () => {
		for (const pack of [animPack, tplPack]) {
			for (const c of pack.categories) {
				expect(pack.items.some((i) => i.category === c.id)).toBe(true);
				expect(c.name.si && c.name.ta).toBeTruthy();
			}
		}
		expect(animPack.categories).toHaveLength(14);
		expect(tplPack.categories).toHaveLength(15);
	});

	test("every referenced effect exists and is used in a phase it supports", () => {
		const check = (anim: TextLibraryAnimation["animation"], at: string) => {
			for (const [which, p] of phases(anim)) {
				const effect = getTextEffect(p.effect);
				expect(effect, `${at}.${which} ${p.effect}`).not.toBeNull();
				expect(effect!.phases, `${at}.${which} ${p.effect}`).toContain(which);
			}
		};
		for (const a of animations) check(a.animation, a.id);
		for (const t of templates) for (const s of t.slots) if (s.animation) check(s.animation, `${t.id}/${s.id}`);
	});

	test("animations are meaningfully distinct", () => {
		const signatures = new Set(allPacks.filter((p) => p.type === "text-animations").flatMap((p) => p.items.map((i) => JSON.stringify((i as TextLibraryAnimation).animation))));
		expect(signatures.size).toBe(allPacks.filter((p) => p.type === "text-animations").reduce((n, p) => n + p.items.length, 0));
		expect(new Set(animations.map((a) => a.name.en)).size).toBe(250);
		const templateSignatures = new Set(templates.map((t) => JSON.stringify(t.slots.map((s) => [s.style, s.animation, s.text.en, s.x, s.y]))));
		expect(templateSignatures.size).toBe(250);
		expect(new Set(templates.map((t) => t.name.en)).size).toBe(250);
	});

	test("timing fits the clip length", () => {
		for (const a of animations) {
			const n = units(a.previewText?.en ?? a.name.en, a.animation.unit);
			expect(phaseSpan(a.animation.in, n) + phaseSpan(a.animation.out, n), a.id).toBeLessThan(a.duration!);
		}
		for (const t of templates)
			for (const s of t.slots) {
				const n = Math.max(...[s.text.en, s.text.si ?? "", s.text.ta ?? ""].map((x) => units(x, s.animation!.unit)));
				expect(phaseSpan(s.animation!.in, n) + phaseSpan(s.animation!.out, n), `${t.id}/${s.id}`).toBeLessThan(t.duration);
			}
	});

	test("Sinhala and Tamil: names, tags and slot texts", () => {
		for (const item of [...animations, ...templates]) {
			expect(item.name.si && item.name.ta, item.id).toBeTruthy();
			expect(item.tags.en.length && item.tags.si.length && item.tags.ta.length, item.id).toBeTruthy();
		}
		for (const t of templates) {
			expect(t.slots.length).toBeGreaterThanOrEqual(1);
			expect(t.slots.length).toBeLessThanOrEqual(4);
			for (const s of t.slots) expect(s.text.si && s.text.ta, `${t.id}/${s.id}`).toBeTruthy();
		}
		const { templates: all } = combinePacks(allPacks);
		expect(searchItems(all, "අවුරුද්ද").length).toBeGreaterThanOrEqual(5);
		expect(searchItems(all, "தீபாவளி").length).toBeGreaterThanOrEqual(5);
		expect(searchItems(all, "vesak").length).toBeGreaterThanOrEqual(5);
		expect(searchItems(all, "pongal").length).toBeGreaterThanOrEqual(5);
	});

	test("social formats include vertical and square; backgrounds are real pack assets", () => {
		const social = templates.filter((t) => t.category === "social");
		expect(social.some((t) => t.aspect === "9:16")).toBe(true);
		expect(social.some((t) => t.aspect === "1:1")).toBe(true);
		const index = JSON.parse(readFileSync(join(repo, "assets", "worksuite-pack", "index.json"), "utf8")) as { assets: Array<{ id: string }> };
		const ids = new Set(index.assets.map((a) => a.id));
		for (const t of templates) if (t.background?.packAsset) expect(ids.has(t.background.packAsset), t.id).toBe(true);
	});

	test("the generator output on disk is up to date", () => {
		const run = spawnSync("node", [join(repo, "scripts", "assets", "generate-text-content.mjs"), "--check"], { encoding: "utf8" });
		if (run.error) return; // node isn't on PATH here
		expect(run.stderr).toBe("");
		expect(run.status).toBe(0);
	});
});

describe("template tiles", () => {
	test("vertical and square templates are letterboxed in the 16:9 tile", async () => {
		const { aspectBox } = await import("../template-render");
		expect(aspectBox("16:9", 160, 90)).toEqual({ x: 0, y: 0, width: 160, height: 90 });
		expect(aspectBox(undefined, 160, 90)).toEqual({ x: 0, y: 0, width: 160, height: 90 });
		const v = aspectBox("9:16", 160, 90);
		expect(v.height).toBe(90);
		expect(v.width).toBeCloseTo(50.625);
		expect(v.x).toBeCloseTo((160 - 50.625) / 2);
		expect(aspectBox("1:1", 160, 90)).toEqual({ x: 35, y: 0, width: 90, height: 90 });
	});
});
