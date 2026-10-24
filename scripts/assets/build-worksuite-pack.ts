// Builds the Worksuite Assets pack: every animation is authored in code in
// scripts/assets/pack/*.ts and written to assets/worksuite-pack/.
//
//   bun scripts/assets/build-worksuite-pack.ts            JSON + metadata + thumbnails + index
//   bun scripts/assets/build-worksuite-pack.ts --no-thumbs  skip the thumbnail render
//
// Thumbnails are rendered by render-thumbnails.mjs in Playwright's Chromium
// with lottie-web (the same runtime as the editor).
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildAnimation } from "./lottie-dsl";
import { type AssetDef, type ImageSlotDef, SOUNDS, type TextSlotDef } from "./pack/common";
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
	const textSlots = new Map<string, TextSlotDef>();
	const imageSlots = new Map<string, ImageSlotDef>();
	const layers = def.build({
		c,
		variant,
		w: def.w,
		h: def.h,
		frames,
		fps,
		textSlot: (slot) => {
			if (!def.colors.some((s) => s.id === slot.color)) throw new Error(`${def.id}: text slot ${slot.id} uses unknown colour slot ${slot.color}`);
			textSlots.set(slot.id, slot);
		},
		imageSlot: (slot) => imageSlots.set(slot.id, slot),
	});
	return {
		lottie: round(buildAnimation({ w: def.w, h: def.h, fps, frames, name: def.name }, layers)),
		textSlots: round([...textSlots.values()]) as TextSlotDef[],
		imageSlots: round([...imageSlots.values()]) as ImageSlotDef[],
	};
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

/** Sound cues in seconds, as asset.json stores them (files relative to the asset folder). */
function soundCues(def: AssetDef) {
	return (def.sounds ?? []).map(({ sound, frame, gainDb }) => {
		if (!(sound in SOUNDS)) throw new Error(`${def.id}: unknown sound ${sound}`);
		const at = Math.round((frame / 30) * 1000) / 1000;
		return { file: `../../sounds/${sound}.wav`, at, ...(gainDb !== undefined ? { gainDb } : {}) };
	});
}

function writePack({ thumbs }: { thumbs: boolean }) {
	// Everything is regenerated except sounds/ (built by build-sounds.py).
	mkdirSync(packDir, { recursive: true });
	for (const entry of readdirSync(packDir)) if (entry !== "sounds") rmSync(join(packDir, entry), { recursive: true, force: true });
	if (!existsSync(join(packDir, "sounds", "click.wav"))) throw new Error("Sounds are missing: run python3 scripts/assets/build-sounds.py");
	const entries: Array<{ dir: string; def: AssetDef; category: string }> = [];
	const slotsById = new Map<string, { textSlots?: TextSlotDef[]; imageSlots?: ImageSlotDef[] }>();
	for (const category of CATEGORIES) {
		for (const def of category.assets) {
			if (def.category !== category.id) throw new Error(`${def.id}: category mismatch`);
			const dir = join(packDir, category.id, def.id);
			mkdirSync(dir, { recursive: true });
			const variants = (def.variants ?? []).map((v, i) => ({ ...v, ...variantFiles(def.id, v.id, i === 0) }));
			let built: ReturnType<typeof buildAsset> | null = null;
			if (variants.length) {
				for (const v of variants) {
					const result = buildAsset(def, v.id);
					built ??= result;
					writeFileSync(join(dir, v.file), JSON.stringify(result.lottie));
				}
			} else {
				built = buildAsset(def);
				writeFileSync(join(dir, `${def.id}.json`), JSON.stringify(built.lottie));
			}
			const slots = {
				...(built?.textSlots.length ? { textSlots: built.textSlots } : {}),
				...(built?.imageSlots.length ? { imageSlots: built.imageSlots } : {}),
			};
			slotsById.set(def.id, slots);
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
				...(def.sounds?.length ? { sounds: soundCues(def) } : {}),
				...slots,
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
		sounds: Object.fromEntries(Object.keys(SOUNDS).map((id) => [`sounds/${id}.wav`, { sha256: sha256(join(packDir, "sounds", `${id}.wav`)) }])),
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
				...(def.sounds?.length
					? {
							sounds: def.sounds.map(({ sound, frame, gainDb }) => ({
								id: sound,
								file: `sounds/${sound}.wav`,
								at: Math.round((frame / 30) * 1000) / 1000,
								durationSec: SOUNDS[sound],
								...(gainDb !== undefined ? { gainDb } : {}),
							})),
						}
					: {}),
				...slotsById.get(def.id),
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
		"Sound effects (click, pop, ding, whoosh, confetti) live in [`sounds/`](sounds); they are synthesised by",
		"`python3 scripts/assets/build-sounds.py`. Assets list them in `asset.json` → `sounds` (`file`, `at` in",
		"seconds, optional `gainDb`), and the editor places them on an audio track when the animation is added.",
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
				`| <img src="${thumb}" width="128" alt=""> | **${def.name}** \`${def.id}\`<br>${def.description}${def.variants ? `<br>Languages: ${def.variants.map((v) => v.name).join(", ")}` : ""}${def.sounds?.length ? `<br>Sounds: ${def.sounds.map((s) => `${s.sound} @ ${Math.round((s.frame / 30) * 100) / 100} s`).join(", ")}` : ""} | ${def.durationSec} s${def.loop ? ", loops" : ""} | ${def.colors.map((s) => `${s.name} \`${s.default}\``).join("<br>")} |`,
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
