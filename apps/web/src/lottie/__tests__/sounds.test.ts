import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePack } from "../../../../../scripts/assets/validate-worksuite-pack";
import { lookupPackAsset, type PackIndex, PACK_ASSET_ALIASES, packSoundPlacements, packSoundUrl } from "../catalog";
import type { WorksuiteAssetMeta } from "../types";

const packDir = join(import.meta.dir, "..", "..", "..", "..", "..", "assets", "worksuite-pack");
const index = JSON.parse(readFileSync(join(packDir, "index.json"), "utf8")) as PackIndex;
const byId = (id: string) => {
	const asset = index.assets.find((a) => a.id === id);
	if (!asset) throw new Error(`no ${id}`);
	return asset;
};

function withPackCopy(edit: (dir: string) => void): string[] {
	const dir = mkdtempSync(join(tmpdir(), "pack-"));
	try {
		cpSync(packDir, dir, { recursive: true });
		edit(dir);
		return validatePack(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("animation sounds", () => {
	test("every subscribe asset and the CTA/reaction ones have sounds", () => {
		for (const asset of index.assets.filter((a) => a.category === "subscribe-buttons")) expect(asset.sounds?.length).toBeGreaterThan(0);
		for (const id of ["cta-subscribe-click", "cta-bell-ring", "cta-like-thumb", "cta-mouse-click", "rx-confetti"]) expect(byId(id).sounds?.length).toBeGreaterThan(0);
	});

	test("the five sounds are bundled and hashed", () => {
		const sounds = (index as unknown as { sounds: Record<string, unknown> }).sounds;
		expect(Object.keys(sounds).sort()).toEqual(["click", "confetti", "ding", "pop", "whoosh"].map((s) => `sounds/${s}.wav`).sort());
	});

	test("validator: a cue past the end, a missing file", () => {
		const metaPath = (dir: string) => join(dir, "subscribe-buttons", "sub-cursor-click", "asset.json");
		const late = withPackCopy((dir) => {
			const meta = JSON.parse(readFileSync(metaPath(dir), "utf8")) as WorksuiteAssetMeta;
			meta.sounds = [{ file: "../../sounds/click.wav", at: 9 }];
			writeFileSync(metaPath(dir), JSON.stringify(meta));
		});
		expect(late.some((p) => p.includes("sub-cursor-click") && p.includes("outside"))).toBe(true);
		const missing = withPackCopy((dir) => {
			const meta = JSON.parse(readFileSync(metaPath(dir), "utf8")) as WorksuiteAssetMeta;
			meta.sounds = [{ file: "../../sounds/nope.wav", at: 1 }];
			writeFileSync(metaPath(dir), JSON.stringify(meta));
		});
		expect(missing.some((p) => p.includes("nope.wav is missing"))).toBe(true);
	});

	test("inserting places audio clips at clip start + at, with the cue's gain", () => {
		const asset = byId("sub-bell-combo");
		const clips = packSoundPlacements({ asset, startSeconds: 5 });
		expect(clips).toHaveLength(3);
		expect(clips.map((c) => Math.round(c.startSeconds * 1000) / 1000)).toEqual([5, 5 + 28 / 30, 5 + 50 / 30].map((s) => Math.round(s * 1000) / 1000));
		expect(clips.map((c) => c.url)).toEqual(["/worksuite-pack/sounds/pop.wav", "/worksuite-pack/sounds/click.wav", "/worksuite-pack/sounds/ding.wav"]);
		expect(clips[0].volumeDb).toBe(-4);
		expect(clips[1].volumeDb).toBeUndefined();
		expect(clips[2].durationSec).toBe(0.6);
		expect(packSoundUrl({ file: "sounds/click.wav" })).toBe("/worksuite-pack/sounds/click.wav");
	});

	test("the click lands on the cursor press frame", () => {
		const cue = byId("sub-cursor-click").sounds?.find((s) => s.id === "click");
		expect(cue?.at).toBeCloseTo(40 / 30, 3);
	});
});

describe("renamed assets", () => {
	test("cta-tap-here resolves to cta-mouse-click", () => {
		expect(PACK_ASSET_ALIASES["cta-tap-here"]).toBe("cta-mouse-click");
		expect(lookupPackAsset(index.assets, "cta-tap-here")?.id).toBe("cta-mouse-click");
		expect(lookupPackAsset(index.assets, "cta-mouse-click")?.id).toBe("cta-mouse-click");
		expect(lookupPackAsset(index.assets, "nope")).toBeNull();
	});

	test("no pointing hand is left in the pack", () => {
		const ids = index.assets.map((a) => a.id);
		expect(ids).not.toContain("cta-tap-here");
		expect(ids).not.toContain("sub-finger-tap");
		const walk = (dir: string): string[] =>
			readdirSync(dir).flatMap((f) => {
				const p = join(dir, f);
				return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") && !p.endsWith("asset.json") && !p.endsWith("index.json") ? [p] : [];
			});
		for (const file of walk(packDir)) {
			const json = readFileSync(file, "utf8");
			expect(json).not.toMatch(/"nm":"(Hand|Finger)"/);
		}
		for (const id of ["cta-mouse-click", "sub-cursor-click"]) {
			const asset = byId(id);
			const json = readFileSync(join(packDir, asset.path, `${id}.json`), "utf8");
			expect(json).toMatch(/"nm":"(Cursor|Mouse)"/);
		}
	});
});
