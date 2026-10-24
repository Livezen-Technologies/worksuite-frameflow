import { detectColorSlots, parseLottie, rgb01ToHex } from "../colors";
import { TEXT_SLOT_PREFIX } from "../slots";
import type { LottieColorSlot, LottieJson, LottieTextSlot } from "../types";
import { readDotLottie, type DotLottieTheme } from "./dotlottie";

/**
 * Lottie import for the media bin: plain JSON or dotLottie (v1/v2). Each
 * animation comes back with its colour slots and its text layers (ty 5)
 * turned into editable text slots (the layer is renamed `slot:text:<id>`
 * so the Motion Editor and renderer treat it like a pack slot).
 */

export interface ImportedAnimation {
	id: string;
	name: string;
	json: LottieJson;
	colors: LottieColorSlot[];
	textSlots: LottieTextSlot[];
	themes: DotLottieTheme[];
}

interface TextDoc {
	t?: string;
	f?: string;
	s?: number;
	fc?: number[];
	j?: number;
	sz?: [number, number];
	ps?: [number, number];
}

const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40) || "text";

/** Turns text layers into text slots. Returns a renamed copy of the JSON and the slots. */
export function textLayersToSlots(json: LottieJson): { json: LottieJson; slots: LottieTextSlot[]; colors: LottieColorSlot[] } {
	const fonts = new Map<string, { family: string; weight: number }>();
	for (const f of ((json.fonts as { list?: Array<{ fName?: string; fFamily?: string; fStyle?: string; fWeight?: string }> })?.list ?? [])) {
		const style = (f.fStyle ?? "").toLowerCase();
		const weight = Number(f.fWeight) || (style.includes("black") ? 900 : style.includes("bold") ? 700 : style.includes("medium") ? 500 : 400);
		if (f.fName) fonts.set(f.fName, { family: f.fFamily ?? f.fName, weight });
	}
	const slots: LottieTextSlot[] = [];
	const extraColors: LottieColorSlot[] = [];
	const used = new Set<string>();
	const layers = (json.layers as Array<Record<string, unknown>>).map((layer) => {
		if (layer.ty !== 5) return layer;
		const name = String(layer.nm ?? "Text");
		if (name.startsWith(TEXT_SLOT_PREFIX)) return layer;
		const keys = ((layer.t as { d?: { k?: Array<{ s?: TextDoc }> } })?.d?.k ?? []) as Array<{ s?: TextDoc }>;
		const doc = keys[0]?.s ?? {};
		const text = String(doc.t ?? "").replace(/\r/g, "\n");
		let id = slugify(name);
		while (used.has(id)) id += "-2";
		used.add(id);
		const size = Number(doc.s) || 48;
		const font = fonts.get(doc.f ?? "") ?? { family: doc.f ?? "Inter", weight: 400 };
		const ks = (layer.ks ?? {}) as { p?: { a?: number; k?: unknown } };
		const p = ks.p && !ks.p.a && Array.isArray(ks.p.k) ? (ks.p.k as number[]) : [Number(json.w) / 2, Number(json.h) / 2];
		const lines = text.split("\n").length;
		const w = doc.sz?.[0] ?? Math.max(size * 0.6 * Math.max(...text.split("\n").map((l) => l.length), 1), size);
		const h = doc.sz?.[1] ?? size * 1.2 * lines;
		const align: LottieTextSlot["align"] = doc.j === 1 ? "right" : doc.j === 2 ? "center" : "left";
		// Lottie text sits on its baseline at the layer origin (point text) or in a box from `ps`.
		const x = doc.ps ? p[0]! + doc.ps[0] : align === "center" ? p[0]! - w / 2 : align === "right" ? p[0]! - w : p[0]!;
		const y = doc.ps ? p[1]! + doc.ps[1] : p[1]! - size * 0.85;
		const hex = rgb01ToHex(doc.fc ?? [1, 1, 1]);
		const colorId = `text-${id}`;
		extraColors.push({ id: colorId, name: `${name} colour`, default: hex });
		const layerName = `${TEXT_SLOT_PREFIX}${id}`;
		slots.push({
			id,
			name,
			layer: layerName,
			defaults: { en: text },
			fontFamily: font.family,
			fontWeight: font.weight,
			fontSize: size,
			box: { x, y, w, h },
			origin: [p[0]!, p[1]!],
			align,
			color: colorId,
		});
		return { ...layer, nm: layerName };
	});
	return { json: { ...json, layers }, slots, colors: extraColors };
}

function prepare({ id, name, json, themes }: { id: string; name: string; json: LottieJson; themes: DotLottieTheme[] }): ImportedAnimation {
	const { json: renamed, slots, colors: textColors } = textLayersToSlots(json);
	const colors = detectColorSlots(renamed);
	for (const c of textColors) if (!colors.some((x) => x.default.toUpperCase() === c.default.toUpperCase())) colors.push(c);
	// Text slots point at a colour slot id; map them onto the detected ones by value.
	for (const slot of slots) {
		const value = textColors.find((c) => c.id === slot.color)?.default.toUpperCase();
		const match = colors.find((c) => c.default.toUpperCase() === value);
		if (match) slot.color = match.id;
	}
	return { id, name, json: renamed, colors, textSlots: slots, themes };
}

/** Every animation in a Lottie JSON or dotLottie file (the caller lets the user pick when there are several). */
export function readLottieFile({ name, bytes }: { name: string; bytes: Uint8Array }): ImportedAnimation[] {
	const base = name.replace(/\.(json|lottie)$/i, "") || "Animation";
	const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
	if (isZip || name.toLowerCase().endsWith(".lottie")) {
		const dot = readDotLottie(bytes);
		return dot.animations.map((a, i) =>
			prepare({ id: a.id, name: dot.animations.length > 1 ? `${base} — ${a.name ?? a.id ?? i + 1}` : base, json: a.json, themes: dot.themes }),
		);
	}
	const json = parseLottie(new TextDecoder().decode(bytes));
	return [prepare({ id: "main", name: base || json.nm || "Animation", json, themes: [] })];
}
