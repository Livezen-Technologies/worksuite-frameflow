import { describe, expect, test } from "bun:test";
import { catalogBaseUrl, packTemplateFacts, resolveCatalogUrl, templateCardVisual } from "@/asset-library/catalog";
import { templateFromZip } from "../online-preview";

describe("online template thumbnails", () => {
	const base = catalogBaseUrl("stable", "https://frameflow.worksuitecloud.com/library/feed/");

	test("catalog paths resolve against the feed, not the app page", () => {
		expect(base).toBe("https://frameflow.worksuitecloud.com/library/feed/stable/");
		expect(resolveCatalogUrl("packs/vt-captions-004-1.0.0.webp", base)).toBe("https://frameflow.worksuitecloud.com/library/feed/stable/packs/vt-captions-004-1.0.0.webp");
		expect(resolveCatalogUrl("https://cdn.example/x.webp", base)).toBe("https://cdn.example/x.webp");
		expect(resolveCatalogUrl("wsc-asset://p/1.0.0/t.webp", null)).toBe("wsc-asset://p/1.0.0/t.webp");
		// A relative path with no base would 404 against the app: no picture instead.
		expect(resolveCatalogUrl("packs/x.webp", null)).toBeNull();
		expect(resolveCatalogUrl(null, base)).toBeNull();
	});

	test("fallback: picture, else live drawing, else placeholder — never a broken image", () => {
		expect(templateCardVisual({ thumb: "https://x/y.webp", imageFailed: false, canDraw: true })).toBe("image");
		expect(templateCardVisual({ thumb: "https://x/y.webp", imageFailed: true, canDraw: true })).toBe("live");
		expect(templateCardVisual({ thumb: null, imageFailed: false, canDraw: true })).toBe("live");
		expect(templateCardVisual({ thumb: "https://x/y.webp", imageFailed: true, canDraw: false })).toBe("placeholder");
	});

	test("aspect and length come from the description for the placeholder badges", () => {
		expect(packTemplateFacts({ description: "Captions template from the Worksuite set. 1:1, 4s, 1 text slot over an animated background.", tags: {} })).toEqual({ aspect: "1:1", seconds: 4 });
		expect(packTemplateFacts({ description: "", tags: { en: ["9-16"] } })).toEqual({ aspect: "9:16", seconds: null });
	});

	test("a pack zip's template is read for the live preview", () => {
		const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
		const files = {
			"index.json": enc({ schema: 1, items: [{ id: "vt", name: "Captions", file: "vt/vt.fftemplate", type: "video_template" }] }),
			"vt/vt.fftemplate": enc({ aspect: { width: 1080, height: 1920 }, duration: 5, layers: [{ kind: "background", background: { t: "grad", c: ["#111111", "#222222"] } }, { kind: "text", text: { en: "Hi" }, x: 0.5, y: 0.5, size: 0.1 }] }),
		};
		const t = templateFromZip({ zip: new Uint8Array(), pack: { id: "vt-pack", title: "Captions", version: "1.0.0" }, unzip: () => files });
		expect(t?.aspect.label).toBe("9:16");
		expect(t?.preview?.duration).toBe(5);
		expect(t?.preview?.slots).toHaveLength(1);
		expect(templateFromZip({ zip: new Uint8Array(), pack: { id: "x", title: "X", version: "1.0.0" }, unzip: () => ({}) })).toBeNull();
	});
});
