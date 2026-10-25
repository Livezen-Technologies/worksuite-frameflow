import { unzipSync } from "fflate";
import { parseProjectTemplate } from "@/asset-library/pack-items";
import type { CatalogPack } from "@/asset-library/types";
import { resolveCatalogUrl } from "@/asset-library/catalog";
import { aspectBox, drawTemplateFrame } from "@/text-library/template-render";
import { drawBackdrop } from "@/text-library/backdrop";
import type { TextContext } from "@/text-animation/render";
import type { ProjectTemplate } from "./project-templates";

/*
 * Live previews of library template packs that aren't installed. The feed
 * only serves whole packs, but template packs are tiny (≈ 10–40 KB), so the
 * zip is fetched once, its index.json and template file read in memory, and
 * the result cached for the session. Anything bigger or unreadable gives
 * null and the card shows its styled placeholder.
 */

/** Template packs above this aren't fetched just for a preview. */
export const PREVIEW_MAX_BYTES = 256 * 1024;

const cache = new Map<string, Promise<ProjectTemplate | null>>();

type Unzip = (data: Uint8Array) => Record<string, Uint8Array>;

/** Reads the first template of a pack zip (index.json → item file). */
export function templateFromZip({ zip, pack, unzip = unzipSync }: { zip: Uint8Array; pack: Pick<CatalogPack, "id" | "title" | "version">; unzip?: Unzip }): ProjectTemplate | null {
	const files = unzip(zip);
	const text = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : null);
	const index = JSON.parse(text("index.json") ?? "null") as { items?: Array<{ id?: string; name?: string; file?: string }> } | null;
	const first = index?.items?.[0];
	if (!first?.id) return null;
	const body = first.file ? text(first.file) : null;
	const raw = body ? JSON.parse(body) : first;
	return parseProjectTemplate({
		raw,
		item: { id: `${pack.id}/${first.id}`, name: first.name ?? pack.title, url: `wsc-asset://${pack.id}/${pack.version}/${first.file ?? ""}`, packId: pack.id, packTitle: pack.title, raw: first as Record<string, unknown> },
	});
}

/** The pack's template for a preview (cached), or null. */
export function loadOnlineTemplate({ pack, base, fetcher = fetch }: { pack: CatalogPack; base: string | null; fetcher?: typeof fetch }): Promise<ProjectTemplate | null> {
	const key = `${pack.id}@${pack.version}`;
	let pending = cache.get(key);
	if (!pending) {
		const url = resolveCatalogUrl(pack.files, base);
		pending =
			!url || pack.sizeBytes > PREVIEW_MAX_BYTES
				? Promise.resolve(null)
				: fetcher(url)
						.then(async (r) => (r.ok ? templateFromZip({ zip: new Uint8Array(await r.arrayBuffer()), pack }) : null))
						.catch(() => null);
		cache.set(key, pending);
	}
	return pending;
}

/** Draws a library template (backdrop + animated text slots) at `time` into a w×h tile. */
export function drawTemplatePreview({ ctx, template, width, height, time, lang = "en" }: { ctx: TextContext; template: ProjectTemplate; width: number; height: number; time: number; lang?: string }) {
	const preview = template.preview;
	if (!preview) return;
	const box = aspectBox(template.aspect.label, width, height);
	ctx.save();
	ctx.translate(box.x, box.y);
	if (preview.bg) drawBackdrop({ ctx, bg: preview.bg, width: box.width, height: box.height, time });
	else {
		ctx.fillStyle = template.palette[1];
		ctx.fillRect(0, 0, box.width, box.height);
	}
	drawTemplateFrame({ ctx, template: { slots: preview.slots, duration: preview.duration }, width: box.width, height: box.height, time, lang });
	ctx.restore();
}
