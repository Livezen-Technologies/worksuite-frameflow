// Renders thumbnail.png (512×512, transparent) for every asset in a pack
// folder, using lottie-web's canvas renderer in Playwright's Chromium: the
// same runtime the editor uses. The frame drawn is `thumbnailAt` (default
// 60 %) of the way through the animation. Assets with language variants
// get a thumbnail per variant (asset.json → variants[].thumbnail).
//
//   node scripts/assets/render-thumbnails.mjs assets/worksuite-pack [--screenshot out.png]
//
// Needs the `playwright` package and its Chromium (PLAYWRIGHT_BROWSERS_PATH
// if they live somewhere shared) and lottie-web in apps/web/node_modules.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packDir = process.argv[2] ?? join(root, "assets", "worksuite-pack");
const lottiePath = join(root, "apps", "web", "node_modules", "lottie-web", "build", "player", "lottie_canvas.min.js");
if (!existsSync(lottiePath)) {
	console.error(`lottie-web isn't installed (${lottiePath}). Run bun install in apps/web.`);
	process.exit(1);
}

let chromium;
try {
	({ chromium } = await import("playwright"));
} catch {
	try {
		const require = createRequire(join(process.env.NODE_PATH ?? "", "noop.js"));
		({ chromium } = require("playwright"));
	} catch {
		console.error("Playwright isn't available. Install it (npm i -g playwright) or set NODE_PATH.");
		process.exit(1);
	}
}

const assets = [];
for (const category of readdirSync(packDir)) {
	const dir = join(packDir, category);
	if (!statSync(dir).isDirectory()) continue;
	for (const id of readdirSync(dir)) {
		const metaPath = join(dir, id, "asset.json");
		if (!existsSync(metaPath)) continue;
		const meta = JSON.parse(readFileSync(metaPath, "utf8"));
		// Assets with language variants get one thumbnail per variant.
		const variants = Array.isArray(meta.variants) && meta.variants.length ? meta.variants : [{ file: meta.file, thumbnail: meta.thumbnail }];
		for (const variant of variants) {
			assets.push({ dir: join(dir, id), meta, thumbnail: variant.thumbnail, json: readFileSync(join(dir, id, variant.file), "utf8") });
		}
	}
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body style='margin:0;background:transparent'></body></html>");
await page.addScriptTag({ path: lottiePath });

for (const { dir, meta, thumbnail, json } of assets) {
	const dataUrl = await page.evaluate(
		async ({ json, at }) => {
			const data = JSON.parse(json);
			const size = 512;
			const scale = Math.min(size / data.w, size / data.h);
			const frameCanvas = document.createElement("canvas");
			frameCanvas.width = Math.round(data.w * scale);
			frameCanvas.height = Math.round(data.h * scale);
			// Size the canvas before loading and never call resize(): resizing a
			// canvas-rendered animation resets the context under lottie-web's
			// cached fill/stroke styles, which then draw black.
			const animation = window.lottie.loadAnimation({
				renderer: "canvas",
				loop: false,
				autoplay: false,
				animationData: data,
				rendererSettings: { context: frameCanvas.getContext("2d"), clearCanvas: true, preserveAspectRatio: "xMidYMid meet" },
			});
			if (!animation.isLoaded) await new Promise((resolve) => animation.addEventListener("DOMLoaded", resolve));
			animation.goToAndStop((data.op - data.ip) * at, true);
			const out = document.createElement("canvas");
			out.width = size;
			out.height = size;
			out.getContext("2d").drawImage(frameCanvas, (size - frameCanvas.width) / 2, (size - frameCanvas.height) / 2);
			animation.destroy();
			return out.toDataURL("image/png");
		},
		{ json, at: meta.thumbnailAt ?? 0.6 },
	);
	writeFileSync(join(dir, thumbnail), Buffer.from(dataUrl.split(",")[1], "base64"));
	process.stdout.write(".");
}
process.stdout.write(`\nRendered ${assets.length} thumbnails\n`);
await browser.close();
