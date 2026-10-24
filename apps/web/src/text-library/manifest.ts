import { getTextEffect } from "@/text-animation/effects";
import { EASING_NAMES } from "@/text-animation/easing";
import type { TextAnimation, TextAnimationStyle } from "@/text-animation/types";

/**
 * Content format for the Text library (Stage 2 adds items in this shape).
 *
 *   assets/packs/text-animations/<pack-id>/pack.json        download-center manifest
 *   assets/packs/text-animations/<pack-id>/categories.json  [{ id, name: {en,si,ta} }]
 *   assets/packs/text-animations/<pack-id>/items/<id>.json  one TextLibraryAnimation each
 *   assets/packs/text-templates/<pack-id>/…                 same, items are TextLibraryTemplate
 *
 * `index.json` (categories + every item inlined) is generated from those
 * files by scripts/assets/text-packs.mjs, for the app and the catalog.
 * Schema: assets/packs/text-pack-item.schema.json.
 */

export type LocalText = { en: string; si?: string; ta?: string };
export type LocalTags = { en: string[]; si: string[]; ta: string[] };

interface ItemBase {
	schema: 1;
	id: string;
	name: LocalText;
	category: string;
	tags: LocalTags;
	/** Pro items are shown with a badge (licensing is the download center's job). */
	plan?: "free" | "pro";
}

export interface TextLibraryAnimation extends ItemBase {
	kind: "animation";
	animation: TextAnimation;
	/** Text the thumbnail plays (per language). */
	previewText?: LocalText;
	/** Suggested look when added as a new clip. */
	style?: Partial<TextAnimationStyle>;
	/** Seconds; the default clip length when added. */
	duration?: number;
}

export interface TemplateSlot {
	id: string;
	name: string;
	text: LocalText;
	/** Centre as a share of the frame (0–1). */
	x: number;
	y: number;
	/** Font size as a share of the frame height. */
	size: number;
	style?: Partial<TextAnimationStyle>;
	animation?: TextAnimation;
	/** Seconds after the template starts / before it ends. */
	start?: number;
	end?: number;
}

export interface TextLibraryTemplate extends ItemBase {
	kind: "template";
	duration: number;
	aspect?: string;
	slots: TemplateSlot[];
	/**
	 * Optional Lottie under the text: a Worksuite pack animation id
	 * (`{ "packAsset": "lower-third-bar" }`) or a file in the pack
	 * (`{ "file": "lottie/bar.json" }`), with colour overrides.
	 */
	background?: { packAsset?: string; file?: string; colors?: Record<string, string> };
}

export type TextLibraryItem = TextLibraryAnimation | TextLibraryTemplate;

export interface TextPackIndex {
	schema: 1;
	type: "text-animations" | "text-templates";
	id: string;
	version: string;
	name: string;
	categories: Array<{ id: string; name: LocalText }>;
	items: TextLibraryItem[];
}

const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ORDERS = /^(forward|reverse|center-out|edges-in|random(\(-?\d+\))?)$/;
const DIRS = new Set(["left", "right", "up", "down", "in", "out"]);
const UNITS = new Set(["grapheme", "word", "line", "block"]);

function easingProblem(e: unknown): string | null {
	if (typeof e === "string") return (EASING_NAMES as string[]).includes(e) ? null : `unknown easing "${e}"`;
	if (Array.isArray(e) && e.length === 4 && e.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
	return "easing must be a name or [x1,y1,x2,y2]";
}

/** Problems with a TextAnimation (empty when valid). */
export function animationProblems(a: unknown, at = "animation"): string[] {
	const out: string[] = [];
	if (!a || typeof a !== "object") return [`${at} must be an object`];
	const anim = a as Partial<TextAnimation>;
	if (anim.version !== 1) out.push(`${at}.version must be 1`);
	if (!UNITS.has(String(anim.unit))) out.push(`${at}.unit must be grapheme|word|line|block`);
	for (const which of ["in", "emphasis", "out"] as const) {
		const p = anim[which];
		if (p === undefined) continue;
		const pat = `${at}.${which}`;
		if (!p || typeof p !== "object") {
			out.push(`${pat} must be an object`);
			continue;
		}
		if (p.effect !== "none" && !getTextEffect(p.effect)) out.push(`${pat}.effect "${p.effect}" isn't a registered effect`);
		for (const key of ["duration", "delay", "stagger", "intensity"] as const)
			if (typeof p[key] !== "number" || !Number.isFinite(p[key]) || p[key] < 0) out.push(`${pat}.${key} must be a number ≥ 0`);
		if (which === "emphasis" && !(p.duration > 0)) out.push(`${pat}.duration must be > 0`);
		if (!ORDERS.test(String(p.staggerOrder))) out.push(`${pat}.staggerOrder is invalid`);
		if (!DIRS.has(String(p.direction))) out.push(`${pat}.direction is invalid`);
		const e = easingProblem(p.easing);
		if (e) out.push(`${pat}.${e}`);
		if (!p.params || typeof p.params !== "object") out.push(`${pat}.params must be an object`);
	}
	if (anim.keyframes) {
		for (const [prop, keys] of Object.entries(anim.keyframes.tracks ?? {})) {
			if (!Array.isArray(keys)) {
				out.push(`${at}.keyframes.${prop} must be a list`);
				continue;
			}
			for (const k of keys) {
				if (typeof k.t !== "number") out.push(`${at}.keyframes.${prop}: t must be a number`);
				if ((prop === "fill" || prop === "stroke") && !(typeof k.v === "string" && HEX.test(k.v))) out.push(`${at}.keyframes.${prop}: v must be #RRGGBB`);
				if (prop !== "fill" && prop !== "stroke" && typeof k.v !== "number") out.push(`${at}.keyframes.${prop}: v must be a number`);
				if (k.easing !== undefined) {
					const e = easingProblem(k.easing);
					if (e) out.push(`${at}.keyframes.${prop}: ${e}`);
				}
			}
		}
	}
	return out;
}

function tagsProblems(tags: unknown, at: string): string[] {
	if (!tags || typeof tags !== "object") return [`${at}.tags must be {en,si,ta}`];
	return (["en", "si", "ta"] as const).filter((l) => !Array.isArray((tags as Record<string, unknown>)[l])).map((l) => `${at}.tags.${l} must be a list`);
}

/** Problems with one library item (empty when valid). */
export function itemProblems(item: unknown, categories?: string[]): string[] {
	if (!item || typeof item !== "object") return ["item must be an object"];
	const it = item as Partial<TextLibraryItem> & Record<string, unknown>;
	const at = `item ${String(it.id ?? "?")}`;
	const out: string[] = [];
	if (it.schema !== 1) out.push(`${at}: schema must be 1`);
	if (!ID.test(String(it.id ?? ""))) out.push(`${at}: id must be lowercase letters, digits and dashes`);
	if (!it.name || typeof it.name !== "object" || !(it.name as LocalText).en) out.push(`${at}: name.en is required`);
	if (typeof it.category !== "string" || !it.category) out.push(`${at}: category is required`);
	else if (categories && !categories.includes(it.category)) out.push(`${at}: category "${it.category}" isn't in categories.json`);
	out.push(...tagsProblems(it.tags, at));
	if (it.kind === "animation") out.push(...animationProblems(it.animation, `${at}.animation`));
	else if (it.kind === "template") {
		if (!(typeof it.duration === "number" && it.duration > 0)) out.push(`${at}: duration must be > 0`);
		if (!Array.isArray(it.slots) || it.slots.length === 0) out.push(`${at}: slots must be a non-empty list`);
		else
			for (const slot of it.slots) {
				const sat = `${at}.slots.${slot?.id ?? "?"}`;
				if (!slot?.id || !slot.text?.en) out.push(`${sat}: id and text.en are required`);
				for (const key of ["x", "y", "size"] as const) if (typeof slot?.[key] !== "number" || slot[key] < 0 || slot[key] > 1) out.push(`${sat}: ${key} must be 0–1`);
				if (slot?.animation) out.push(...animationProblems(slot.animation, `${sat}.animation`));
			}
		if (it.background && !it.background.packAsset && !it.background.file) out.push(`${at}: background needs packAsset or file`);
	} else out.push(`${at}: kind must be "animation" or "template"`);
	return out;
}

/** Problems with a whole pack index (ids unique, categories known). */
export function packIndexProblems(index: TextPackIndex): string[] {
	const out: string[] = [];
	const categories = index.categories.map((c) => c.id);
	const seen = new Set<string>();
	for (const item of index.items) {
		if (seen.has(item.id)) out.push(`duplicate id ${item.id}`);
		seen.add(item.id);
		out.push(...itemProblems(item, categories));
		const want = index.type === "text-animations" ? "animation" : "template";
		if (item.kind !== want) out.push(`item ${item.id}: a ${index.type} pack only holds ${want} items`);
	}
	return out;
}

/** Search across names and tags in every language (case- and diacritic-insensitive for Latin). */
export function searchItems<T extends TextLibraryItem>(items: T[], query: string): T[] {
	const q = query.trim().toLocaleLowerCase().normalize("NFC");
	if (!q) return items;
	const terms = q.split(/\s+/);
	return items.filter((item) => {
		const hay = [item.name.en, item.name.si, item.name.ta, item.category, ...item.tags.en, ...item.tags.si, ...item.tags.ta, item.id]
			.filter(Boolean)
			.join(" ")
			.toLocaleLowerCase()
			.normalize("NFC");
		return terms.every((t) => hay.includes(t));
	});
}

export function localName(text: LocalText, lang: string): string {
	return (lang === "si" ? text.si : lang === "ta" ? text.ta : undefined) || text.en;
}
