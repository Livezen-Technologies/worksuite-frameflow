import { describe, expect, test } from "bun:test";
import { itemJson, itemJsonSource, parseProjectTemplate, parseTransition } from "../pack-items";
import { cutTarget, runPackDrop, type PackDropDeps, type PackDropRequest } from "../pack-drop";
import { pickItem, registerInstalledPack, unregisterInstalledPack } from "../registry";

/*
 * "Download & Add" on a library transitions pack did nothing. The shapes
 * below are copied from the live feed (additive-dissolve-1-tr-01-05@1.0.1,
 * vt-captions-and-that-is-the-secret-captions-004@1.0.0).
 */

const TRANSITION_INDEX = {
	schema: 1,
	name: "Additive dissolve 1",
	items: [
		{
			id: "additive-dissolve-1-tr-01-05",
			name: "Additive dissolve 1",
			file: "additive-dissolve-1-tr-01-05/additive-dissolve-1-tr-01-05.ffx",
			type: "transition",
			thumbnail: "additive-dissolve-1-tr-01-05/thumbnail.webp",
			render_engine: "cross-dissolve",
			default_duration_ms: 1300,
		},
	],
};
const FFX = { schema: 1, value: { type: "cross-dissolve", duration: 1.3, easing: "back" }, source: { set: "Worksuite transitions", id: "tr-01-05", category: "Fades & dissolves", variant: 4 } };

const fetcher = (files: Record<string, unknown>) => async (url: string) => {
	const hit = Object.entries(files).find(([k]) => url.endsWith(k));
	return { ok: !!hit, json: async () => hit?.[1] };
};

async function installTransitionPack() {
	unregisterInstalledPack("additive-dissolve-1-tr-01-05", { quiet: true });
	await registerInstalledPack({ id: "additive-dissolve-1-tr-01-05", type: "transitions", title: "Additive dissolve 1", version: "1.0.1" }, fetcher({ "index.json": TRANSITION_INDEX }));
}

describe("library transitions pack", () => {
	test("pickItem finds the first item of the real index shape, bare or prefixed", async () => {
		await installTransitionPack();
		const first = pickItem({ packId: "additive-dissolve-1-tr-01-05" });
		expect(first?.id).toBe("additive-dissolve-1-tr-01-05/additive-dissolve-1-tr-01-05");
		expect(first?.url.endsWith("additive-dissolve-1-tr-01-05.ffx")).toBe(true);
		expect(first?.packTitle).toBe("Additive dissolve 1");
		expect(pickItem({ packId: "additive-dissolve-1-tr-01-05", itemId: "additive-dissolve-1-tr-01-05" })?.id).toBe(first?.id);
		expect(pickItem({ packId: "additive-dissolve-1-tr-01-05", itemId: "nope" })).toBeNull();
	});

	test("the item's .ffx file is read, not its index metadata (the root cause)", async () => {
		await installTransitionPack();
		const item = pickItem({ packId: "additive-dissolve-1-tr-01-05" })!;
		// Before the fix the extra index keys made the item "inline", and
		// parseTransition saw type "transition" (not an engine) → null → nothing happened.
		expect(parseTransition({ raw: { type: "transition" }, item: { ...item, raw: {} } })).toBeNull();
		expect(itemJsonSource(item)).toBe("file");
		const raw = await itemJson(item, async (url) => (url.endsWith(".ffx") ? FFX : null));
		expect(parseTransition({ raw, item })?.value).toEqual({ type: "cross-dissolve", duration: 1.3, easing: "ease-in-out", direction: "left", alignment: "center" });
	});

	test("index metadata alone is enough when the file has no type", async () => {
		await installTransitionPack();
		const item = pickItem({ packId: "additive-dissolve-1-tr-01-05" })!;
		expect(parseTransition({ raw: { schema: 1 }, item })?.value).toMatchObject({ type: "cross-dissolve", duration: 1.3 });
	});

	test("text packs keep their items inline (their URL is the pack base)", () => {
		expect(itemJsonSource({ url: "wsc-asset://p/1.0.0", raw: { id: "a", file: "a/a.json", params: { content: "Hi" } } })).toBe("inline");
		expect(itemJsonSource({ url: "wsc-asset://p/1.0.0/x.json", raw: { id: "a", name: "A", file: "x.json" } })).toBe("file");
	});

	test("no cut: transitions only install (no project or no two clips side by side)", () => {
		expect(cutTarget({ target: { kind: "default" }, nearest: () => null })).toBeNull();
		expect(cutTarget({ target: { kind: "default" }, nearest: () => ({ trackId: "main", element: { id: "c2" }, maxSeconds: 2 }) })).toEqual({ trackId: "main", elementId: "c2", maxSeconds: 2 });
		expect(cutTarget({ target: { kind: "cut", trackId: "m", elementId: "e", maxSeconds: 1 }, nearest: () => null })).toEqual({ trackId: "m", elementId: "e", maxSeconds: 1 });
	});
});

describe("runPackDrop outcomes are never silent", () => {
	const request: PackDropRequest = { packId: "p", packType: "transitions", title: "P", target: { kind: "default" }, placeholder: false };
	const deps = (over: Partial<PackDropDeps>): PackDropDeps => ({
		insertPlaceholder: () => null,
		removePlaceholder: () => {},
		install: async () => true,
		cancelInstall: () => {},
		history: { mark: () => 0, squash: () => {} },
		perform: () => true,
		...over,
	});

	test("install resolving false tells the user (onCancelled)", async () => {
		let told = 0;
		const drop = runPackDrop({ request, deps: deps({ install: async () => false, onCancelled: () => told++ }) });
		expect(await drop.done).toBe("cancelled");
		expect(told).toBe(1);
	});

	test("a user cancel doesn't also toast", async () => {
		let told = 0;
		let resolve!: (v: boolean) => void;
		const drop = runPackDrop({ request, deps: deps({ install: () => new Promise((r) => (resolve = r)), onCancelled: () => told++ }) });
		drop.cancel();
		resolve(false);
		expect(await drop.done).toBe("cancelled");
		expect(told).toBe(0);
	});

	test("perform false → installed; throw → failed with onError", async () => {
		expect(await runPackDrop({ request, deps: deps({ perform: () => false }) }).done).toBe("installed");
		const errors: unknown[] = [];
		expect(await runPackDrop({ request, deps: deps({ perform: () => { throw new Error("bad item"); }, onError: (e) => errors.push(e) }) }).done).toBe("failed");
		expect(String(errors[0])).toContain("bad item");
		expect(await runPackDrop({ request, deps: deps({ install: async () => { throw new Error("403"); }, onError: (e) => errors.push(e) }) }).done).toBe("failed");
		expect(errors).toHaveLength(2);
	});
});

describe("library video templates (.fftemplate)", () => {
	const raw = {
		schema: 1,
		aspect: { width: 1080, height: 1080 },
		duration: 4,
		layers: [
			{ id: "background", kind: "background", start: 0, duration: 4, background: { t: "video", c: ["#3A4A5C", "#1A1D22", "#E2231A"] } },
			{ id: "title", kind: "text", name: "Title", start: 0, duration: 4, text: { en: "And that is the secret", si: "ඒක තමයි රහස" }, x: 0.5, y: 0.84, size: 0.08, style: { fontFamily: "Oswald, Gemunu Libre", fill: "#FFFFFF" } },
		],
		source: { name: { en: "Captions · And that is the secret" }, category: "captions", aspect: "1:1", anim: "Fade words" },
	};
	const item = { id: "vt/vt", name: "Captions", url: "wsc-asset://vt/1.0.0/vt/vt.fftemplate", packId: "vt", packTitle: "Captions · And that is the secret", raw: {} };

	test("become project templates with a live preview and their pack", () => {
		const t = parseProjectTemplate({ raw, item });
		expect(t?.name).toBe("Captions · And that is the secret");
		expect(t?.aspect).toEqual({ label: "1:1", width: 1080, height: 1080 });
		expect(t?.category).toBe("Social");
		expect(t?.layers.map((l) => l.kind)).toEqual(["shape", "text"]);
		expect(t?.layers[1]).toMatchObject({ content: "And that is the secret", x: 0, start: 0, duration: 4 });
		expect(t?.preview?.bg?.t).toBe("video");
		expect(t?.preview?.slots[0]?.text.si).toBe("ඒක තමයි රහස");
		expect(t?.source).toEqual({ kind: "pack", packId: "vt", packTitle: "Captions · And that is the secret" });
	});
});
