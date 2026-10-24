// Builds the Worksuite Assets pack: every animation is authored in code in
// scripts/assets/pack/*.ts and written to assets/worksuite-pack/.
//
//   bun scripts/assets/build-worksuite-pack.ts            JSON + metadata + thumbnails + index
//   bun scripts/assets/build-worksuite-pack.ts --no-thumbs  skip the thumbnail render
//
// Thumbnails are rendered by render-thumbnails.mjs in Playwright's Chromium
// with lottie-web (the same runtime as the editor).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildAnimation } from "./lottie-dsl";
import type { AssetDef } from "./pack/common";
import { lowerThirds } from "./pack/lower-thirds";
import { callToAction } from "./pack/call-to-action";
import { callouts } from "./pack/callouts";
import { reactions } from "./pack/reactions";
import { seasonal } from "./pack/seasonal";
import { transitions } from "./pack/transitions";
import { status } from "./pack/status";
import { subscribeButtons } from "./pack/subscribe";
import { validatePack } from "./validate-worksuite-pack";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packDir = join(root, "assets", "worksuite-pack");

export const CATEGORIES: Array<{ id: string; name: string; assets: AssetDef[] }> = [
	{ id: "lower-thirds", name: "Lower thirds", assets: lowerThirds },
	{ id: "call-to-action", name: "Call to action", assets: callToAction },
	{ id: "callouts", name: "Callouts", assets: callouts },
	{ id: "reactions", name: "Reactions", assets: reactions },
	{ id: "sri-lanka-seasonal", name: "Sri Lankan seasons", assets: seasonal },
	{ id: "transitions", name: "Transitions", assets: transitions },
	{ id: "status-infographics", name: "Status & infographics", assets: status },
	{ id: "subscribe-buttons", name: "YouTube & subscribe", assets: subscribeButtons },
];

const round = (value: unknown): unknown => {
	if (typeof value === "number") return Math.round(value * 1000) / 1000;
	if (Array.isArray(value)) return value.map(round);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)]));
	}
	return value;
};

function buildAsset(def: AssetDef, variant = "default") {
	const fps = 30;
	const frames = Math.round(def.durationSec * fps);
	const ids = new Set<string>();
	const defaults = new Set<string>();
	for (const s of def.colors) {
		if (ids.has(s.id)) throw new Error(`${def.id}: duplicate colour slot ${s.id}`);
		if (defaults.has(s.default.toUpperCase())) throw new Error(`${def.id}: two slots share ${s.default}`);
		ids.add(s.id);
		defaults.add(s.default.toUpperCase());
	}
	const c = (slotId: string) => {
		const found = def.colors.find((s) => s.id === slotId);
		if (!found) throw new Error(`${def.id}: unknown colour slot "${slotId}"`);
		return found.default;
	};
	const layers = def.build({ c, variant, w: def.w, h: def.h, frames, fps });
	return round(buildAnimation({ w: def.w, h: def.h, fps, frames, name: def.name }, layers));
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function sha256(file: string) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Files of one variant: the default keeps the plain names. */
export function variantFiles(id: string, variant: string, isDefault: boolean) {
	return isDefault
		? { file: `${id}.json`, thumbnail: "thumbnail.png" }
		: { file: `${id}.${variant}.json`, thumbnail: `thumbnail.${variant}.png` };
}

function writePack({ thumbs }: { thumbs: boolean }) {
	rmSync(packDir, { recursive: true, force: true });
	const entries: Array<{ dir: string; def: AssetDef; category: string }> = [];
	for (const category of CATEGORIES) {
		for (const def of category.assets) {
			if (def.category !== category.id) throw new Error(`${def.id}: category mismatch`);
			const dir = join(packDir, category.id, def.id);
			mkdirSync(dir, { recursive: true });
			const variants = (def.variants ?? []).map((v, i) => ({ ...v, ...variantFiles(def.id, v.id, i === 0) }));
			if (variants.length) {
				for (const v of variants) writeFileSync(join(dir, v.file), JSON.stringify(buildAsset(def, v.id)));
			} else {
				writeFileSync(join(dir, `${def.id}.json`), JSON.stringify(buildAsset(def)));
			}
			const g = gcd(def.w, def.h);
			const meta = {
				schema: 1,
				id: def.id,
				name: def.name,
				category: def.category,
				type: "lottie",
				file: `${def.id}.json`,
				thumbnail: "thumbnail.png",
				license: "MIT",
				description: def.description,
				tags: def.tags,
				durationSec: def.durationSec,
				loop: def.loop,
				aspect: `${def.w / g}:${def.h / g}`,
				width: def.w,
				height: def.h,
				thumbnailAt: def.thumbAt ?? 0.6,
				colors: def.colors,
				...(variants.length ? { defaultVariant: variants[0].id, variants } : {}),
			};
			writeFileSync(join(dir, "asset.json"), `${JSON.stringify(meta, null, "\t")}\n`);
			entries.push({ dir, def, category: category.id });
		}
	}

	if (thumbs) {
		const result = spawnSync("node", [join(root, "scripts", "assets", "render-thumbnails.mjs"), packDir], { stdio: "inherit" });
		if (result.status !== 0) throw new Error("Thumbnail render failed");
	}

	const index = {
		schema: 1,
		name: "Worksuite Assets",
		license: "MIT",
		categories: CATEGORIES.map(({ id, name, assets }) => ({ id, name, count: assets.length })),
		assets: entries.map(({ dir, def, category }) => {
			const variantNames = (def.variants ?? []).slice(1).flatMap((v) => Object.values(variantFiles(def.id, v.id, false)));
			const files = [`${def.id}.json`, "thumbnail.png", ...variantNames, "asset.json"].filter((f) => existsSync(join(dir, f)));
			return {
				id: def.id,
				name: def.name,
				category,
				path: relative(packDir, dir).split("\\").join("/"),
				tags: def.tags,
				durationSec: def.durationSec,
				loop: def.loop,
				width: def.w,
				height: def.h,
				colors: def.colors,
				...(def.variants?.length
					? { defaultVariant: def.variants[0].id, variants: def.variants.map(({ id, name, lang }) => ({ id, name, lang })) }
					: {}),
				files: Object.fromEntries(files.map((f) => [f, { sha256: sha256(join(dir, f)) }])),
			};
		}),
	};
	writeFileSync(join(packDir, "index.json"), `${JSON.stringify(index, null, "\t")}\n`);
	writeReadme(entries);
	return entries.length;
}

function writeReadme(entries: Array<{ def: AssetDef; category: string }>) {
	const lines = [
		"# Worksuite Assets",
		"",
		"Original animated motion graphics for Worksuite FrameFlow, made entirely from code in",
		"[`scripts/assets/pack`](../../scripts/assets/pack). They are Lottie files (30 fps, no text",
		"layers) with colour slots, so the editor can recolour them. Licence: MIT, like the rest of the repository.",
		"",
		"Rebuild with `bun scripts/assets/build-worksuite-pack.ts` and check with",
		"`bun scripts/assets/validate-worksuite-pack.ts`. Do not edit the generated files by hand.",
		"",
	];
	for (const category of CATEGORIES) {
		const items = entries.filter((e) => e.category === category.id);
		lines.push(`## ${category.name} (${items.length})`, "");
		if (category.id === "subscribe-buttons") {
			lines.push(
				"Generic, brand-free subscribe, bell and like buttons. Assets with words come in English, Sinhala and Tamil",
				"variants (`asset.json` → `variants`) with the same timing and colour slots. The words are vector outlines",
				"shaped with HarfBuzz from OFL fonts (Inter, Noto Sans Sinhala, Noto Sans Tamil) by",
				"[`scripts/assets/shape-text.py`](../../scripts/assets/shape-text.py); there are no text layers.",
				"",
			);
		}
		lines.push("| Preview | Asset | Length | Colours |", "| --- | --- | --- | --- |");
		for (const { def } of items) {
			const thumb = `${category.id}/${def.id}/thumbnail.png`;
			lines.push(
				`| <img src="${thumb}" width="128" alt=""> | **${def.name}** \`${def.id}\`<br>${def.description}${def.variants ? `<br>Languages: ${def.variants.map((v) => v.name).join(", ")}` : ""} | ${def.durationSec} s${def.loop ? ", loops" : ""} | ${def.colors.map((s) => `${s.name} \`${s.default}\``).join("<br>")} |`,
			);
		}
		lines.push("");
	}
	writeFileSync(join(packDir, "README.md"), lines.join("\n"));
}

if (import.meta.main) {
	const thumbs = !process.argv.includes("--no-thumbs");
	const count = writePack({ thumbs });
	const problems = validatePack(packDir, { requireThumbnails: thumbs });
	if (problems.length) {
		console.error(problems.join("\n"));
		process.exit(1);
	}
	console.log(`Built ${count} assets in ${relative(root, packDir)}`);
}
