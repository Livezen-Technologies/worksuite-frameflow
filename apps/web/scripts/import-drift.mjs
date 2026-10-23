// Imports the Lottie assets of a Drift-Assets checkout into the Drift sticker pack.
//
//   node scripts/import-drift.mjs <path to Drift-Assets>
//
// Writes public/stickers/drift/<id>.json and <id>.png (one pair per variant) and
// src/stickers/providers/drift-catalog.json. Colour slots are baked into the
// fills they name, since the slot values (not the fills' own colours) are what
// the asset is meant to look like. Thumbnails are shrunk with `sips` on macOS
// and copied as they are elsewhere.

import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THUMBNAIL_SIZE = 192;

const source = process.argv[2];
if (!source || !existsSync(join(source, "lottie"))) {
	console.error("Usage: node scripts/import-drift.mjs <path to Drift-Assets>");
	process.exit(1);
}

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public/stickers/drift");
const catalogPath = join(webRoot, "src/stickers/providers/drift-catalog.json");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const hasSips = (() => {
	try {
		execFileSync("sips", ["--help"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

/** Replaces every `{ k, sid }` property with the slot's value. */
function bakeSlots(node, slots) {
	if (Array.isArray(node)) {
		for (const child of node) bakeSlots(child, slots);
		return;
	}
	if (!node || typeof node !== "object") return;
	if (typeof node.sid === "string" && slots[node.sid]?.p) {
		const { a, k } = slots[node.sid].p;
		node.a = a;
		node.k = k;
		delete node.sid;
	}
	for (const value of Object.values(node)) bakeSlots(value, slots);
}

function markerRange(markers, name, fps) {
	const marker = (markers ?? []).find((m) => m.cm === name);
	return marker ? [marker.tm / fps, (marker.tm + marker.dr) / fps] : undefined;
}

const catalog = [];
const lottieRoot = join(source, "lottie");
for (const category of readdirSync(lottieRoot).sort()) {
	const categoryDir = join(lottieRoot, category);
	if (!existsSync(categoryDir) || category.startsWith(".")) continue;
	for (const assetId of readdirSync(categoryDir).sort()) {
		const metaPath = join(categoryDir, assetId, "asset.json");
		if (!existsSync(metaPath)) continue;
		const meta = JSON.parse(readFileSync(metaPath, "utf8"));
		const variants = meta.variants?.length ? meta.variants : [meta];
		variants.forEach((variant, index) => {
			const id = index === 0 ? meta.id : `${meta.id}--${variant.id}`;
			const animation = JSON.parse(
				readFileSync(join(categoryDir, assetId, variant.file), "utf8"),
			);
			bakeSlots(animation.layers, animation.slots ?? {});
			bakeSlots(animation.assets, animation.slots ?? {});
			delete animation.slots;
			writeFileSync(join(outDir, `${id}.json`), JSON.stringify(animation));

			const thumbnail = join(categoryDir, assetId, variant.thumbnail);
			const thumbnailOut = join(outDir, `${id}.png`);
			if (hasSips) {
				execFileSync(
					"sips",
					["-Z", String(THUMBNAIL_SIZE), thumbnail, "--out", thumbnailOut],
					{ stdio: "ignore" },
				);
			} else {
				copyFileSync(thumbnail, thumbnailOut);
			}

			const fps = animation.fr;
			catalog.push({
				id,
				name:
					variants.length > 1 ? `${meta.name} (${variant.name})` : meta.name,
				category,
				tags: [...new Set([...(meta.tags ?? []), ...(variant.tags ?? [])])],
				width: animation.w,
				height: animation.h,
				fps,
				frames: animation.op - animation.ip,
				playback: variant.playback ?? meta.playback ?? "intro-hold",
				intro: markerRange(animation.markers, "intro", fps),
				outro: markerRange(animation.markers, "outro", fps),
			});
		});
	}
}

writeFileSync(
	join(outDir, "LICENSE.md"),
	`# Drift asset pack

These animations come from the Drift asset pack and are licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/):
use them non-commercially, credit Drift, and share changed versions under the same licence.
Colour slots are baked into the fills and thumbnails are resized; the animations are otherwise unchanged.
`,
);
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, "\t")}\n`);
console.log(`Imported ${catalog.length} Drift animations into ${outDir}`);
