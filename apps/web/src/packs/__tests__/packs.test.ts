import { describe, expect, test } from "bun:test";
import { anchorCentre, compilePackTemplate, safeArea } from "../compile";
import { PACKS } from "../data";
import type { PackLanguage } from "../types";

const LANGS: PackLanguage[] = ["en", "si", "mixed"];

function find({ pack, id }: { pack: string; id: string }) {
	const p = PACKS.find((x) => x.id === pack);
	const t = p?.templates.find((x) => x.id === id);
	if (!p || !t) throw new Error(`missing ${pack}:${id}`);
	return { pack: p, template: t };
}

describe("packs", () => {
	test("each pack has at least 12 templates in three languages", () => {
		for (const pack of PACKS) {
			expect(pack.templates.length).toBeGreaterThanOrEqual(12);
			for (const t of pack.templates)
				for (const layer of t.layers)
					if (layer.kind === "text")
						for (const l of LANGS)
							expect(layer.text[l].length).toBeGreaterThan(0);
		}
	});

	test("Sinhala versions use Sinhala letters and a Sinhala font", () => {
		const { pack, template } = find({ pack: "youtube", id: "subscribe" });
		const compiled = compilePackTemplate({
			pack,
			template,
			aspect: "16:9",
			language: "si",
		});
		const texts = compiled.layers.flatMap((l) =>
			l.kind === "text" ? [l] : [],
		);
		expect(texts.some((l) => /[඀-෿]/.test(l.content))).toBe(true);
		expect(texts.every((l) => l.style.fontFamily === "Noto Sans Sinhala")).toBe(
			true,
		);
	});

	test("placeholders fill from fields, else the language default", () => {
		const { pack, template } = find({ pack: "youtube", id: "lower-third" });
		const filled = compilePackTemplate({
			pack,
			template,
			aspect: "16:9",
			language: "en",
			fields: { name: "Nimal", role: "" },
		});
		const contents = filled.layers.flatMap((l) =>
			l.kind === "text" ? [l.content] : [],
		);
		expect(contents).toContain("Nimal");
		expect(contents).toContain("Your role");
		expect(contents.join(" ")).not.toContain("{");
	});

	test("TikTok layers stay inside the safe area", () => {
		const pack = PACKS.find((p) => p.id === "tiktok");
		if (!pack) throw new Error("missing");
		const safe = safeArea({ pack, aspect: "9:16" });
		for (const t of pack.templates)
			for (const layer of t.layers) {
				if (layer.kind === "shape" && layer.w > 1) continue; // full-frame backdrops
				const box = anchorCentre({
					anchor: layer.anchor,
					safe,
					w: layer.w,
					h: layer.h,
					dx: layer.dx,
					dy: layer.dy,
				});
				const eps = 1e-6;
				expect(box.x + box.width / 2).toBeLessThanOrEqual(1 - safe.right + eps);
				expect(box.y + box.height / 2).toBeLessThanOrEqual(
					1 - safe.bottom + eps,
				);
				expect(box.x - box.width / 2).toBeGreaterThanOrEqual(safe.left - eps);
				expect(box.y - box.height / 2).toBeGreaterThanOrEqual(safe.top - eps);
			}
	});

	test("a lower third moves up into the vertical safe area on 9:16", () => {
		const { pack, template } = find({ pack: "youtube", id: "lower-third" });
		const y = (aspect: "16:9" | "9:16") => {
			const layer = compilePackTemplate({
				pack,
				template,
				aspect,
				language: "en",
			}).layers[0];
			return layer.kind === "shape" ? (layer.y ?? 0) : 0;
		};
		expect(y("9:16")).toBeLessThan(y("16:9"));
	});

	test("brand colours replace the pack palette", () => {
		const { pack, template } = find({ pack: "youtube", id: "channel-card" });
		const c = compilePackTemplate({
			pack,
			template,
			aspect: "16:9",
			language: "en",
			brand: { palette: { primary: "#123456" } },
		});
		expect(
			c.layers.some((l) => l.kind === "shape" && l.fill === "#123456"),
		).toBe(true);
	});

	test("no template bundles a logo or image", () => {
		expect(JSON.stringify(PACKS)).not.toMatch(/logo|brandfetch|\.svg|\.png/i);
	});
});
