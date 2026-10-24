import { describe, expect, test } from "bun:test";
import {
	formatAssetRef,
	isMeteredConnection,
	libraryPacks,
	missingPacks,
	packForAsset,
	packStatus,
	parseAssetRef,
	planMissingPacks,
	projectPackRefs,
	searchPacks,
} from "../catalog";
import { placeholderLottieData, resolvePlaceholderData } from "../placeholders";
import { packSounds, registerInstalledPack, syncInstalledPacks } from "../registry";
import type { AssetStoreState, CatalogPack } from "../types";
import { findPackAsset, isMotionPackRegistered, lookupPackAsset, MissingPackError, PACK_ASSET_ALIASES, type PackIndexAsset } from "@/lottie/catalog";

const pack = (over: Partial<CatalogPack> = {}): CatalogPack => ({
	id: "festive-motion",
	type: "motion",
	version: "1.2.0",
	title: "Festive motion",
	description: "Vesak and Avurudu graphics",
	tags: { en: ["vesak", "lantern"], si: ["වෙසක්"], ta: ["வெசாக்"] },
	languages: ["en", "si", "ta"],
	sizeBytes: 1000,
	sha256: "a".repeat(64),
	licence: "MIT",
	minAppVersion: "1.0.0",
	thumbnailUrl: null,
	previewUrl: null,
	files: "packs/festive-motion-1.2.0.zip",
	plan: "free",
	assetIds: ["vesak-lantern"],
	...over,
});

const baseState = (over: Partial<AssetStoreState> = {}): AssetStoreState => ({
	settings: { channel: "stable", missingPacks: "auto", autoUpdate: true, starterPacks: true, unmeteredOnly: false, storageLimitBytes: 0 },
	catalog: { schema: 1, channel: "stable", packs: [pack()] },
	catalogStatus: { state: "ready", error: null, fetchedAt: 0, stale: false },
	installed: {},
	builtin: [{ id: "subscribe-buttons", type: "motion", title: "Subscribe buttons", version: "builtin" }],
	downloads: {},
	...over,
});

describe("catalog search and status", () => {
	test("searches tags in English, Sinhala and Tamil", () => {
		const packs = [pack(), pack({ id: "sfx", type: "sounds", title: "Whooshes", tags: { en: ["whoosh"] }, languages: [] })];
		expect(searchPacks({ packs, query: "වෙසක්" }).map((p) => p.id)).toEqual(["festive-motion"]);
		expect(searchPacks({ packs, query: "வெசாக்" }).map((p) => p.id)).toEqual(["festive-motion"]);
		expect(searchPacks({ packs, query: "", type: "sounds" }).map((p) => p.id)).toEqual(["sfx"]);
		expect(searchPacks({ packs, query: "", language: "si" }).map((p) => p.id)).toEqual(["festive-motion"]);
	});
	test("status: built-in, installed, update available, downloading", () => {
		const s = baseState();
		expect(packStatus({ id: "subscribe-buttons", version: "1.1.0" }, s)).toBe("builtin");
		expect(packStatus(pack(), s)).toBe("not-installed");
		const installed = baseState({ installed: { "festive-motion": { id: "festive-motion", type: "motion", title: "", version: "1.0.0", sizeBytes: 1, installedAt: 0, previousVersion: null } } });
		expect(packStatus(pack(), installed)).toBe("update-available");
		expect(packStatus(pack({ version: "1.0.0" }), installed)).toBe("installed");
		expect(packStatus(pack(), baseState({ downloads: { "festive-motion": { status: "downloading", received: 1, total: 2, version: "1.2.0", error: null } } }))).toBe("downloading");
	});
	test("built-in packs are listed even without a catalog", () => {
		expect(libraryPacks({ catalog: null, builtin: baseState().builtin }).map((p) => p.id)).toEqual(["subscribe-buttons"]);
	});
	test("asset refs round trip", () => {
		const ref = { packId: "festive-motion", version: "1.2.0", assetId: "vesak-lantern" };
		expect(parseAssetRef(formatAssetRef(ref))).toEqual(ref);
		expect(parseAssetRef("../x@1/y")).toBeNull();
		expect(packForAsset([pack({ version: "1.0.0" }), pack()], "vesak-lantern")?.version).toBe("1.2.0");
	});
});

describe("projects with missing packs", () => {
	const elements = [
		{ lottie: { source: { kind: "pack", assetId: "vesak-lantern", pack: { id: "festive-motion", version: "1.2.0" } } } },
		{ lottie: { source: { kind: "pack", assetId: "sub-avatar-bar", pack: { id: "subscribe-buttons", version: "1.1.0" } } } },
		{ lottie: { source: { kind: "pack", assetId: "lt-bar-slide" } } },
	];
	test("finds packs that aren't installed (built-ins never missing)", () => {
		expect(missingPacks(projectPackRefs(elements), baseState())).toEqual(["festive-motion"]);
		const newer = baseState({ installed: { "festive-motion": { id: "festive-motion", type: "motion", title: "", version: "1.3.0", sizeBytes: 1, installedAt: 0, previousVersion: null } } });
		expect(missingPacks(projectPackRefs(elements), newer)).toEqual([]);
	});
	const plan = (policy: "auto" | "ask" | "never", extra: Partial<Parameters<typeof planMissingPacks>[0]> = {}) =>
		planMissingPacks({ missing: ["festive-motion", "gone-pack"], policy, online: true, metered: false, unmeteredOnly: false, catalog: [pack()], ...extra });
	test("auto installs, ask queues, never keeps placeholders", () => {
		expect(plan("auto")).toEqual({ install: ["festive-motion"], ask: [], placeholder: ["gone-pack"] });
		expect(plan("ask")).toEqual({ install: [], ask: ["festive-motion"], placeholder: ["gone-pack"] });
		expect(plan("never")).toEqual({ install: [], ask: [], placeholder: ["festive-motion", "gone-pack"] });
	});
	test("offline keeps placeholders; metered with Wi-Fi only asks", () => {
		expect(plan("auto", { online: false }).placeholder).toEqual(["festive-motion", "gone-pack"]);
		expect(plan("auto", { metered: true, unmeteredOnly: true }).ask).toEqual(["festive-motion"]);
		expect(isMeteredConnection({ connection: { type: "cellular" } })).toBe(true);
		expect(isMeteredConnection({ connection: { type: "wifi" } })).toBe(false);
	});
});

const fakeAsset: PackIndexAsset = {
	id: "vesak-lantern",
	name: "Vesak lantern",
	category: "seasonal",
	path: "seasonal/vesak-lantern",
	tags: [],
	durationSec: 3,
	loop: true,
	width: 1080,
	height: 1920,
	colors: [],
	files: {},
};

describe("placeholders resolve when the pack installs", () => {
	test("placeholder clip → real size and length, edits kept", async () => {
		const data = { ...placeholderLottieData({ packId: "festive-motion", version: "1.2.0", assetId: "vesak-lantern" }), colors: { "#FFFFFF": "#FF0000" } };
		await expect(findPackAsset("vesak-lantern", { id: "festive-motion", version: "1.2.0" })).rejects.toBeInstanceOf(MissingPackError);
		const index = { schema: 1 as const, name: "Festive", license: "MIT", categories: [{ id: "seasonal", name: "Seasonal", count: 1 }], assets: [fakeAsset] };
		await registerInstalledPack(
			{ id: "festive-motion", type: "motion", title: "Festive", version: "1.3.0" },
			async (url) => ({ ok: url === "wsc-asset://festive-motion/1.3.0/index.json", json: async () => index }),
		);
		expect(isMotionPackRegistered("festive-motion", "1.3.0")).toBe(true);
		const asset = await findPackAsset("vesak-lantern", { id: "festive-motion", version: "1.2.0" });
		expect(asset?.base).toBe("wsc-asset://festive-motion/1.3.0");
		const resolved = resolvePlaceholderData(data, asset as PackIndexAsset);
		expect(resolved.placeholder).toBeUndefined();
		expect([resolved.width, resolved.height, resolved.frames, resolved.loop]).toEqual([1080, 1920, 90, true]);
		expect(resolved.colors).toEqual({ "#FFFFFF": "#FF0000" });
		expect(resolved.source).toEqual({ kind: "pack", assetId: "vesak-lantern", pack: { id: "festive-motion", version: "1.3.0" } });
	});
	test("sound packs register their sounds; uninstall removes them", async () => {
		await registerInstalledPack(
			{ id: "sfx-pack", type: "sounds", title: "SFX", version: "1.0.0" },
			async () => ({ ok: true, json: async () => ({ schema: 1, sounds: [{ id: "whoosh", file: "sounds/whoosh.wav" }] }) }),
		);
		expect(packSounds().map((s) => s.url)).toContain("wsc-asset://sfx-pack/1.0.0/sounds/whoosh.wav");
		await syncInstalledPacks({});
		expect(packSounds()).toEqual([]);
		expect(isMotionPackRegistered("festive-motion")).toBe(false);
	});
});

describe("backward compatibility", () => {
	test("old asset ids still resolve through aliases", () => {
		const assets = [{ id: "cta-mouse-click" }, { id: "sub-avatar-bar" }];
		for (const [oldId, newId] of Object.entries(PACK_ASSET_ALIASES)) expect(lookupPackAsset(assets, oldId)?.id).toBe(newId);
		expect(lookupPackAsset(assets, "sub-avatar-bar")?.id).toBe("sub-avatar-bar");
	});
});
