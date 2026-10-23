import { describe, expect, test } from "bun:test";
import { lottieSecondsAt } from "../lottie";
import {
	driftProvider,
	getDriftAsset,
	loadDriftCatalog,
	matchesDriftQuery,
	type DriftAsset,
} from "../providers/drift";

const base = { fps: 30, frames: 120 };

describe("lottieSecondsAt", () => {
	test("loops repeat", () => {
		const asset = { ...base, playback: "loop" as const };
		expect(lottieSecondsAt({ asset, clipSeconds: 1, clipLength: 10 })).toBe(1);
		expect(lottieSecondsAt({ asset, clipSeconds: 5, clipLength: 10 })).toBe(1);
	});

	test("intro-hold stops on the last frame", () => {
		const asset = { ...base, playback: "intro-hold" as const };
		expect(lottieSecondsAt({ asset, clipSeconds: 2, clipLength: 10 })).toBe(2);
		expect(lottieSecondsAt({ asset, clipSeconds: 9, clipLength: 10 })).toBe(119 / 30);
	});

	test("intro-hold-outro holds, then ends the outro with the clip", () => {
		const asset = {
			...base,
			playback: "intro-hold-outro" as const,
			intro: [0, 2.8] as [number, number],
			outro: [3.2, 4] as [number, number],
		};
		expect(lottieSecondsAt({ asset, clipSeconds: 1, clipLength: 10 })).toBe(1);
		expect(lottieSecondsAt({ asset, clipSeconds: 6, clipLength: 10 })).toBe(2.8);
		expect(lottieSecondsAt({ asset, clipSeconds: 9.6, clipLength: 10 })).toBeCloseTo(3.6);
		// Shorter than intro + outro: plays straight through.
		expect(lottieSecondsAt({ asset, clipSeconds: 3, clipLength: 3 })).toBe(3);
	});
});

describe("Drift pack", () => {
	test("every catalog entry is complete", async () => {
		const catalog = await loadDriftCatalog();
		expect(catalog.length).toBeGreaterThan(0);
		const ids = new Set<string>();
		for (const asset of catalog) {
			expect(ids.has(asset.id)).toBe(false);
			ids.add(asset.id);
			expect(asset.width).toBeGreaterThan(0);
			expect(asset.frames).toBeGreaterThan(0);
			if (asset.playback === "intro-hold-outro") {
				expect(asset.intro).toBeDefined();
				expect(asset.outro).toBeDefined();
			}
		}
	});

	test("search matches names and tags, all terms required", () => {
		const asset = {
			name: "Cursor Click",
			category: "app-ui",
			tags: ["mouse", "tutorial"],
		} as DriftAsset;
		expect(matchesDriftQuery({ asset, query: "cursor" })).toBe(true);
		expect(matchesDriftQuery({ asset, query: "mouse tutorial" })).toBe(true);
		expect(matchesDriftQuery({ asset, query: "mouse heart" })).toBe(false);
	});

	test("ids resolve to their asset and thumbnail", async () => {
		const result = await driftProvider.search({ query: "cursor click" });
		const item = result.items[0];
		expect(item.id.startsWith("drift:")).toBe(true);
		expect(driftProvider.resolveUrl({ stickerId: item.id })).toBe(item.previewUrl);
		expect((await getDriftAsset({ stickerId: item.id }))?.name).toBe(item.name);
		expect(await getDriftAsset({ stickerId: "flags:US" })).toBeNull();
	});
});
