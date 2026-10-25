import { useEffect, useState } from "react";
import type { ParamValues } from "@/params";
import { TEMPLATE_CATEGORIES, type ProjectTemplate, type TemplateAspect, type TemplateLayer } from "@/templates/project-templates";
import { TRANSITIONS } from "@/transitions/definitions";
import type { ClipTransition } from "@/transitions/types";
import { isBackdrop } from "@/text-library/backdrop";
import type { TemplateSlot } from "@/text-library/manifest";
import { onPackContentChange, packContent, type PackContentItem } from "./registry";
import { PACK_TYPES, type PackType } from "./types";

/*
 * Downloaded pack items for the editor's panels. Packs list their items in
 * index.json (see registry.ts); for preset types each item's file is a JSON
 * preset in the shape the panel already uses:
 *   transitions                    { name, value: ClipTransition }
 *   effects                        { name, effects: [{ type, params }] }
 *   filters, color-profiles        { name, grade, extras? }
 *   text-templates                 { name, params }
 *   video-templates                ProjectTemplate (name, aspect, palette, layers…)
 *   brand-kits                     { name, colors, headingFont?, bodyFont?, logos? }
 * Graphics, stickers and LUTs are plain files (images/video, .cube).
 * Parsers drop anything malformed so a bad pack can't break a panel.
 */

const jsonCache = new Map<string, Promise<unknown>>();

/** Fetches (once) and parses a pack file. */
export function loadPackJson({ url, fetcher = fetch }: { url: string; fetcher?: typeof fetch }): Promise<unknown> {
	let pending = jsonCache.get(url);
	if (!pending) {
		pending = fetcher(url).then((r) => {
			if (!r.ok) throw new Error(`Couldn't read ${url}`);
			return r.json();
		});
		pending.catch(() => jsonCache.delete(url));
		jsonCache.set(url, pending);
	}
	return pending;
}

/**
 * Where an item's JSON lives. Library packs list every item with metadata
 * next to `file` (`type`, `thumbnail`, `render_engine`, `default_duration_ms`…),
 * so extra keys don't make an item inline: when the item names a file and its
 * URL is that file, the file is the item. Text packs keep items inline in
 * index.json (their URL is the pack base), so those stay inline.
 */
export function itemJsonSource(item: Pick<PackContentItem, "url" | "raw">): "file" | "inline" {
	const file = item.raw?.file;
	if (typeof file === "string" && file && item.url.endsWith(file)) return "file";
	return item.raw && Object.keys(item.raw).some((k) => k !== "id" && k !== "name" && k !== "file") ? "inline" : "file";
}

/** Parsed JSON of an item: its own file, or inline in index.json. */
export async function itemJson(item: PackContentItem, load: (url: string) => Promise<unknown> = (url) => loadPackJson({ url })): Promise<unknown> {
	return itemJsonSource(item) === "inline" ? item.raw : load(item.url);
}

export interface LoadedPackItem<T> {
	item: PackContentItem;
	value: T;
}

export type PackItemParser<T> = (args: { raw: unknown; item: PackContentItem }) => T | null;

/** For plain-file types: the item itself, no JSON read. */
export const asFile: PackItemParser<PackContentItem> = ({ item }) => item;

/**
 * Items of `types` from installed packs, each parsed by `parse` (which reads
 * the item's JSON unless it is `asFile`). Updates when packs are installed
 * or removed. Pass a module-level `parse` so it is stable across renders.
 */
export function usePackItems<T>({ types, parse }: { types: PackType[]; parse: PackItemParser<T> }): LoadedPackItem<T>[] {
	const [items, setItems] = useState<LoadedPackItem<T>[]>([]);
	const key = types.join(",");
	useEffect(() => {
		let cancelled = false;
		const wanted = PACK_TYPES.filter((t) => key.split(",").includes(t));
		const load = async () => {
			const loaded = await Promise.all(
				wanted.flatMap((t) => packContent(t)).map(async (item) => {
					try {
						const raw = parse === asFile ? null : await itemJson(item);
						const value = parse({ raw, item });
						return value ? { item, value } : null;
					} catch {
						return null;
					}
				}),
			);
			if (!cancelled) setItems(loaded.filter((x) => x !== null));
		};
		void load();
		const off = onPackContentChange(() => void load());
		return () => {
			cancelled = true;
			off();
		};
	}, [key, parse]);
	return items;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function oneOf<T extends string>({ value, options, fallback }: { value: unknown; options: readonly T[]; fallback: T }): T {
	return options.find((o) => o === value) ?? fallback;
}

const nameOf = ({ raw, item }: { raw: Record<string, unknown>; item: PackContentItem }) => (typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : item.name);

function paramValues(v: unknown): ParamValues | null {
	if (!isObject(v)) return null;
	const out: ParamValues = {};
	for (const [k, x] of Object.entries(v)) if (typeof x === "number" || typeof x === "string" || typeof x === "boolean") out[k] = x;
	return out;
}

export interface PackTransition {
	id: string;
	name: string;
	value: ClipTransition;
}

export const parseTransition: PackItemParser<PackTransition> = ({ raw, item }) => {
	if (!isObject(raw)) return null;
	const v = isObject(raw.value) ? raw.value : raw;
	// Library items also name the engine in index.json (`render_engine`).
	const meta = item.raw ?? {};
	const type = TRANSITIONS.find((t) => t.type === v.type)?.type ?? TRANSITIONS.find((t) => t.type === raw.render_engine || t.type === meta.render_engine)?.type;
	if (!type) return null;
	const metaMs = typeof meta.default_duration_ms === "number" ? meta.default_duration_ms / 1000 : undefined;
	return {
		id: item.id,
		name: nameOf({ raw, item }),
		value: {
			type,
			duration: typeof v.duration === "number" && v.duration > 0 ? Math.min(v.duration, 5) : metaMs && metaMs > 0 ? Math.min(metaMs, 5) : 0.8,
			easing: oneOf({ value: v.easing, options: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out" }),
			direction: oneOf({ value: v.direction, options: ["left", "right", "up", "down"], fallback: "left" }),
			alignment: oneOf({ value: v.alignment, options: ["center", "start", "end"], fallback: "center" }),
		},
	};
};

const FILTER_EXTRAS = ["vignette", "film-grain", "sepia"] as const;

export interface PackFilter {
	id: string;
	name: string;
	grade: ParamValues;
	extras?: { type: (typeof FILTER_EXTRAS)[number]; params: ParamValues }[];
}

export const parseFilter: PackItemParser<PackFilter> = ({ raw, item }) => {
	if (!isObject(raw)) return null;
	const grade = paramValues(raw.grade);
	if (!grade || Object.keys(grade).length === 0) return null;
	const extras = Array.isArray(raw.extras)
		? raw.extras.flatMap((e) => {
				if (!isObject(e)) return [];
				const type = FILTER_EXTRAS.find((t) => t === e.type);
				return type ? [{ type, params: paramValues(e.params) ?? {} }] : [];
			})
		: [];
	return { id: item.id, name: nameOf({ raw, item }), grade, ...(extras.length ? { extras } : {}) };
};

export interface PackEffectStack {
	id: string;
	name: string;
	effects: { type: string; params: ParamValues; enabled: boolean }[];
}

/** Effect stacks, keeping only effects for which `knownType` is true. */
export function effectStackParser({ knownType }: { knownType: (type: string) => boolean }): PackItemParser<PackEffectStack> {
	return ({ raw, item }) => {
		if (!isObject(raw) || !Array.isArray(raw.effects)) return null;
		const effects = raw.effects.flatMap((e) => (isObject(e) && typeof e.type === "string" && knownType(e.type) ? [{ type: e.type, params: paramValues(e.params) ?? {}, enabled: e.enabled !== false }] : []));
		return effects.length ? { id: item.id, name: nameOf({ raw, item }), effects } : null;
	};
}

export interface PackTextTemplate {
	id: string;
	name: string;
	params: ParamValues;
}

export const parseTextTemplate: PackItemParser<PackTextTemplate> = ({ raw, item }) => {
	if (!isObject(raw)) return null;
	const params = paramValues(raw.params);
	if (!params || typeof params.content !== "string") return null;
	return { id: item.id, name: nameOf({ raw, item }), params };
};

function isTemplateLayer(l: unknown): l is TemplateLayer {
	if (!isObject(l) || typeof l.start !== "number" || typeof l.duration !== "number" || l.duration <= 0) return false;
	const num = (k: string) => typeof l[k] === "number";
	if (l.kind === "media") return num("slot") && typeof l.color === "string";
	if (l.kind === "text") return typeof l.content === "string" && isObject(l.style);
	if (l.kind === "logo") return num("width") && num("height");
	if (l.kind === "shape") return (l.definitionId === "rectangle" || l.definitionId === "ellipse") && typeof l.fill === "string" && num("width") && num("height");
	return false;
}

const ASPECT_LABELS: TemplateAspect["label"][] = ["16:9", "9:16", "1:1", "4:5"];

const LIBRARY_CATEGORIES: Array<[RegExp, ProjectTemplate["category"]]> = [
	[/intro|opener|title/i, "Intro"],
	[/slide|travel|memories|photo/i, "Slideshow"],
	[/sinhala|avurudu|vesak|poson|සිංහල/i, "සිංහල"],
	[/business|corporate|agenda|report/i, "Business"],
	[/promo|sale|product|offer/i, "Promo"],
	[/caption|social|reel|story|quote/i, "Social"],
];

/**
 * A library video template (.fftemplate: `background` + `text` layers with
 * x/y as shares of the frame, sizes as shares of its height and wording in
 * en/si/ta) as a ProjectTemplate. The backdrop becomes a full-frame shape,
 * each text a title; the original slots are kept for the live preview.
 */
function fromLibraryTemplate({ raw, item }: { raw: Record<string, unknown>; item: PackContentItem }): ProjectTemplate | null {
	const aspect = raw.aspect;
	if (!isObject(aspect) || typeof aspect.width !== "number" || typeof aspect.height !== "number" || aspect.width <= 0 || aspect.height <= 0) return null;
	const source = isObject(raw.source) ? raw.source : {};
	const total = typeof raw.duration === "number" && raw.duration > 0 ? raw.duration : 4;
	const layers: TemplateLayer[] = [];
	const slots: TemplateSlot[] = [];
	let bg: NonNullable<ProjectTemplate["preview"]>["bg"];
	const timing = (l: Record<string, unknown>) => {
		const start = typeof l.start === "number" && l.start >= 0 ? l.start : 0;
		const duration = typeof l.duration === "number" && l.duration > 0 ? l.duration : total - start;
		return { start, duration: Math.max(0.1, duration) };
	};
	for (const l of raw.layers as unknown[]) {
		if (!isObject(l)) continue;
		if (l.kind === "background" && isBackdrop(l.background)) {
			bg = l.background;
			layers.push({ kind: "shape", definitionId: "rectangle", fill: l.background.c[0] ?? "#000000", width: 1, height: 1, ...timing(l) });
		} else if (l.kind === "text" && isObject(l.text) && typeof l.text.en === "string") {
			const style = isObject(l.style) ? l.style : {};
			const x = typeof l.x === "number" ? l.x : 0.5;
			const y = typeof l.y === "number" ? l.y : 0.5;
			const size = typeof l.size === "number" && l.size > 0 ? l.size : 0.06;
			const { start, duration } = timing(l);
			slots.push({
				id: typeof l.id === "string" ? l.id : `t${slots.length}`,
				name: typeof l.name === "string" ? l.name : "Text",
				text: l.text as TemplateSlot["text"],
				x,
				y,
				size,
				style: style as TemplateSlot["style"],
				...(isObject(l.animation) ? { animation: l.animation as unknown as TemplateSlot["animation"] } : {}),
				start,
				end: Math.max(0, total - start - duration),
			});
			layers.push({
				kind: "text",
				content: l.text.en,
				start,
				duration,
				x: x - 0.5,
				y: y - 0.5,
				style: {
					fontFamily: typeof style.fontFamily === "string" ? style.fontFamily.split(",")[0]!.trim() : "Inter",
					// Shares of the frame height → the editor's text size (≈ 34 for a 1080p title).
					fontSize: Math.round(size * 420),
					color: typeof style.fill === "string" ? style.fill : "#FFFFFF",
					"animation.in": "fade",
					"animation.inDuration": 0.4,
				},
			});
		} else if (isTemplateLayer(l)) layers.push(l);
	}
	if (!layers.some((l) => l.kind !== "shape") && !slots.length) return null;
	const ratio = aspect.width / aspect.height;
	const label: TemplateAspect["label"] = typeof source.aspect === "string" && (ASPECT_LABELS as string[]).includes(source.aspect) ? (source.aspect as TemplateAspect["label"]) : ratio > 1.2 ? "16:9" : ratio < 0.7 ? "9:16" : ratio < 0.9 ? "4:5" : "1:1";
	const cat = `${typeof source.category === "string" ? source.category : ""} ${item.name}`;
	const name = isObject(source.name) && typeof source.name.en === "string" ? source.name.en : nameOf({ raw, item });
	return {
		id: item.id,
		name,
		category: LIBRARY_CATEGORIES.find(([re]) => re.test(cat))?.[1] ?? "Promo",
		aspect: { label, width: aspect.width, height: aspect.height },
		description: typeof raw.description === "string" ? raw.description : typeof source.anim === "string" ? `${source.anim} · ${typeof source.set === "string" ? source.set : "Worksuite"}` : "",
		palette: bg ? [bg.c[0] ?? "#4C8DFF", bg.c[1] ?? bg.c[0] ?? "#0F172A"] : ["#4C8DFF", "#0F172A"],
		layers,
		preview: { ...(bg ? { bg } : {}), slots, duration: total },
	};
}

const isLibraryTemplate = (raw: Record<string, unknown>) =>
	Array.isArray(raw.layers) && raw.layers.some((l) => isObject(l) && (l.kind === "background" || (l.kind === "text" && isObject(l.text))));

/** A video (project) template from a pack, with every layer checked. */
export const parseProjectTemplate: PackItemParser<ProjectTemplate> = ({ raw, item }) => {
	if (!isObject(raw) || !Array.isArray(raw.layers) || raw.layers.length === 0) return null;
	if (isLibraryTemplate(raw)) {
		const template = fromLibraryTemplate({ raw, item });
		return template && { ...template, source: { kind: "pack", packId: item.packId, packTitle: item.packTitle ?? item.packId } };
	}
	const layers = raw.layers.filter(isTemplateLayer);
	if (layers.length !== raw.layers.length) return null;
	const aspect = raw.aspect;
	if (!isObject(aspect) || typeof aspect.width !== "number" || typeof aspect.height !== "number" || aspect.width <= 0 || aspect.height <= 0) return null;
	const ratio = aspect.width / aspect.height;
	const guessed = ratio > 1.2 ? "16:9" : ratio < 0.7 ? "9:16" : ratio < 0.9 ? "4:5" : "1:1";
	const [a, b]: unknown[] = Array.isArray(raw.palette) ? raw.palette : [];
	return {
		id: item.id,
		name: nameOf({ raw, item }),
		category: oneOf({ value: raw.category, options: TEMPLATE_CATEGORIES, fallback: "Promo" }),
		aspect: { label: oneOf({ value: aspect.label, options: ASPECT_LABELS, fallback: guessed }), width: aspect.width, height: aspect.height },
		description: typeof raw.description === "string" ? raw.description : "",
		palette: typeof a === "string" && typeof b === "string" ? [a, b] : ["#4C8DFF", "#0F172A"],
		layers,
		source: { kind: "pack", packId: item.packId, packTitle: item.packTitle ?? item.packId },
	};
};

export interface PackBrandKit {
	id: string;
	name: string;
	colors: string[];
	headingFont: string | null;
	bodyFont: string | null;
	/** Absolute URLs of logo files in the pack. */
	logos: { name: string; url: string }[];
}

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export const parseBrandKit: PackItemParser<PackBrandKit> = ({ raw, item }) => {
	if (!isObject(raw) || !Array.isArray(raw.colors)) return null;
	const colors = raw.colors.flatMap((c) => {
		const hex = typeof c === "string" ? c : isObject(c) ? c.hex : null;
		return typeof hex === "string" && HEX.test(hex) ? [hex.toUpperCase()] : [];
	});
	if (!colors.length) return null;
	const font = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
	const base = item.url.slice(0, item.url.lastIndexOf("/") + 1);
	const logos = Array.isArray(raw.logos)
		? raw.logos.flatMap((l) => {
				const file = typeof l === "string" ? l : isObject(l) ? l.file : null;
				// Only files inside the pack: no absolute URLs or parent paths.
				if (typeof file !== "string" || !/^[\w./-]+$/.test(file) || file.split("/").includes("..")) return [];
				const name = isObject(l) && typeof l.name === "string" ? l.name : (file.split("/").pop() ?? file);
				return [{ name, url: base + file }];
			})
		: [];
	return { id: item.id, name: nameOf({ raw, item }), colors: colors.slice(0, 12), headingFont: font(raw.headingFont), bodyFont: font(raw.bodyFont), logos };
};

/** Pack files that are images or video, for Elements. */
export function isMediaItem(item: PackContentItem): boolean {
	return /\.(png|webp|gif|apng|svg|jpe?g|webm|mp4|mov)$/i.test(item.url);
}

/** Downloads a pack file as a File (for media import or LUT import). */
export async function packItemFile({ item, fetcher = fetch }: { item: PackContentItem; fetcher?: typeof fetch }): Promise<File> {
	const res = await fetcher(item.url);
	if (!res.ok) throw new Error(`Couldn't read ${item.name}`);
	const blob = await res.blob();
	return new File([blob], item.url.split("/").pop() ?? item.name, { type: blob.type });
}
