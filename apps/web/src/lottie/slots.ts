import type {
	ImageSlotOverride,
	LottieImageSlot,
	LottieJson,
	LottieSlotOverrides,
	LottieTextSlot,
	TextSlotOverride,
} from "./types";

/*
 * Motion Editor slots (pure logic, no DOM). Text slots draw live text over
 * the animation following the slot layer; image slots draw a picture
 * clipped by the slot layer's shape. A slot is only drawn live when the
 * clip overrides it: otherwise the authored outlines show, exactly as the
 * thumbnails and earlier exports.
 */

export const TEXT_SLOT_PREFIX = "slot:text:";
export const IMAGE_SLOT_PREFIX = "slot:image:";

/** The words a text slot shows: the override, else the default for `lang`, else English. */
export function slotText({
	slot,
	override,
	lang,
}: {
	slot: Pick<LottieTextSlot, "defaults" | "uppercase">;
	override?: TextSlotOverride;
	lang?: string | null;
}): string {
	const raw = override?.text ?? slot.defaults[lang ?? "en"] ?? slot.defaults.en ?? "";
	return applyCase(raw, override?.case ?? (slot.uppercase ? "upper" : "as-typed"));
}

export function applyCase(text: string, mode: NonNullable<TextSlotOverride["case"]>): string {
	switch (mode) {
		case "upper":
			return text.toLocaleUpperCase();
		case "lower":
			return text.toLocaleLowerCase();
		case "title":
			return text.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase());
		default:
			return text;
	}
}

/** Text slots drawn live on this clip (those with any override). */
export function liveTextSlots(slots: LottieTextSlot[], overrides?: LottieSlotOverrides): LottieTextSlot[] {
	return slots.filter((slot) => overrides?.text?.[slot.id] && Object.keys(overrides.text[slot.id]).length > 0);
}

export function liveImageSlots(slots: LottieImageSlot[], overrides?: LottieSlotOverrides): LottieImageSlot[] {
	return slots.filter((slot) => !!overrides?.image?.[slot.id]?.src);
}

/**
 * The largest font size ≤ `fontSize` at which `text` fits `box` on one
 * line. `measure(size)` returns the text's width at that size (with
 * letter spacing); widths scale linearly, so one measurement is enough,
 * then a check guards rounding.
 */
export function fitFontSize({
	measure,
	fontSize,
	box,
	minSize = 6,
}: {
	measure: (size: number) => number;
	fontSize: number;
	box: { w: number; h: number };
	minSize?: number;
}): number {
	let size = Math.min(fontSize, box.h / 1.15);
	const width = measure(size);
	if (width > box.w && width > 0) size = (size * box.w) / width;
	while (size > minSize && measure(size) > box.w) size *= 0.97;
	return Math.max(minSize, size);
}

/** Where to start a line of `width` in `box` for an alignment (canvas textAlign "left"). */
export function alignedX(box: { x: number; w: number }, width: number, align: LottieTextSlot["align"]): number {
	if (align === "center") return box.x + (box.w - width) / 2;
	if (align === "right") return box.x + box.w - width;
	return box.x;
}

/** A slot's box relative to its layer's position at rest (what the layer transform maps). */
export function localBox(slot: Pick<LottieTextSlot, "box" | "origin">) {
	return { x: slot.box.x - slot.origin[0], y: slot.box.y - slot.origin[1], w: slot.box.w, h: slot.box.h };
}

/**
 * A 2D affine [a, b, c, d, e, f] (canvas setTransform order) from
 * lottie-web's 4×4 `props` (column-major, translation in 12/13), placed
 * into a canvas where the composition is contain-fitted.
 */
export function layerToCanvasMatrix({
	props,
	comp,
	canvas,
}: {
	props: ArrayLike<number>;
	comp: { w: number; h: number };
	canvas: { width: number; height: number };
}): [number, number, number, number, number, number] {
	const s = Math.min(canvas.width / comp.w, canvas.height / comp.h);
	const ox = (canvas.width - comp.w * s) / 2;
	const oy = (canvas.height - comp.h * s) / 2;
	return [props[0] * s, props[1] * s, props[4] * s, props[5] * s, props[12] * s + ox, props[13] * s + oy];
}

/** Where to draw a picture in a mask (layer-local, centred on 0,0). */
export function imageDrawRect({
	image,
	mask,
	override,
}: {
	image: { width: number; height: number };
	mask: LottieImageSlot["mask"];
	override: Pick<ImageSlotOverride, "fit" | "zoom" | "offsetX" | "offsetY">;
}): { x: number; y: number; w: number; h: number } {
	const sx = mask.w / Math.max(1, image.width);
	const sy = mask.h / Math.max(1, image.height);
	const base = override.fit === "fit" ? Math.min(sx, sy) : Math.max(sx, sy);
	const scale = base * Math.max(0.1, override.zoom || 1);
	const w = image.width * scale;
	const h = image.height * scale;
	return {
		x: -w / 2 + (override.offsetX || 0) * mask.w,
		y: -h / 2 + (override.offsetY || 0) * mask.h,
		w,
		h,
	};
}

/** Paths a mask as a canvas path (layer-local, centred). */
export function traceMask(
	context: Pick<CanvasRenderingContext2D, "beginPath" | "ellipse" | "rect"> & { roundRect?: CanvasRenderingContext2D["roundRect"] },
	mask: LottieImageSlot["mask"],
) {
	context.beginPath();
	if (mask.shape === "ellipse") context.ellipse(0, 0, mask.w / 2, mask.h / 2, 0, 0, Math.PI * 2);
	else if (mask.radius && context.roundRect) context.roundRect(-mask.w / 2, -mask.h / 2, mask.w, mask.h, mask.radius);
	else context.rect(-mask.w / 2, -mask.h / 2, mask.w, mask.h);
}

/**
 * A copy of the animation with the paint of `layers` hidden (fills and
 * strokes at 0 % opacity) and `removed` layers dropped from view. The
 * layers keep their transforms, so live text and pictures can follow them.
 */
export function hideLayerPaint(json: LottieJson, { paint, removed = [] }: { paint: string[]; removed?: string[] }): LottieJson {
	if (paint.length === 0 && removed.length === 0) return json;
	const hidePaint = new Set(paint);
	const drop = new Set(removed);
	const silence = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(silence);
		if (!value || typeof value !== "object") return value;
		const node = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(node)) out[k] = silence(v);
		if (node.ty === "fl" || node.ty === "st" || node.ty === "gf" || node.ty === "gs") out.o = { a: 0, k: 0 };
		return out;
	};
	return {
		...json,
		layers: (json.layers as Array<Record<string, unknown>>).map((layer) => {
			const name = String(layer.nm ?? "");
			if (drop.has(name)) return { ...layer, hd: true };
			if (hidePaint.has(name)) return { ...layer, shapes: silence(layer.shapes) };
			return layer;
		}),
	};
}

/** Named layers of an animation (for the Motion Editor's element list), top first. */
export function namedLayers(json: Pick<LottieJson, "layers">): Array<{ name: string; kind: "text" | "image" | "layer" }> {
	return (json.layers as Array<{ nm?: string }>).flatMap((layer): Array<{ name: string; kind: "text" | "image" | "layer" }> => {
		const name = layer.nm;
		if (!name) return [];
		if (name.startsWith(TEXT_SLOT_PREFIX)) return [{ name, kind: "text" as const }];
		if (name.startsWith(IMAGE_SLOT_PREFIX)) return [{ name, kind: "image" as const }];
		return [{ name, kind: "layer" as const }];
	});
}

/** The layers whose paint the renderer hides for these overrides. */
export function layersToHide({
	textSlots,
	imageSlots,
	overrides,
}: {
	textSlots: LottieTextSlot[];
	imageSlots: LottieImageSlot[];
	overrides?: LottieSlotOverrides;
}): { paint: string[]; removed: string[] } {
	const live = liveTextSlots(textSlots, overrides).map((s) => s.layer);
	// Image slots keep their placeholder (it's under the picture and is the mask shape).
	void imageSlots;
	const hidden = overrides?.hidden ?? [];
	return { paint: live.filter((l) => !hidden.includes(l)), removed: hidden };
}

/**
 * Overrides kept across a pack update: slots that still exist keep their
 * values, others are dropped (and reported), so a newer pack never breaks
 * a project.
 */
export function carryOverrides({
	overrides,
	textSlots,
	imageSlots,
	layerNames,
}: {
	overrides?: LottieSlotOverrides;
	textSlots: Array<{ id: string }>;
	imageSlots: Array<{ id: string }>;
	layerNames: string[];
}): { overrides: LottieSlotOverrides; dropped: string[] } {
	const dropped: string[] = [];
	const keep = <T,>(record: Record<string, T> | undefined, ids: Set<string>) => {
		if (!record) return undefined;
		const out: Record<string, T> = {};
		for (const [id, value] of Object.entries(record)) {
			if (ids.has(id)) out[id] = value;
			else dropped.push(id);
		}
		return Object.keys(out).length ? out : undefined;
	};
	const text = keep(overrides?.text, new Set(textSlots.map((s) => s.id)));
	const image = keep(overrides?.image, new Set(imageSlots.map((s) => s.id)));
	const names = new Set(layerNames);
	const hidden = (overrides?.hidden ?? []).filter((name) => {
		if (names.has(name)) return true;
		dropped.push(name);
		return false;
	});
	return {
		overrides: { ...(text ? { text } : {}), ...(image ? { image } : {}), ...(hidden.length ? { hidden } : {}) },
		dropped,
	};
}

/** Stable cache key for what changes the rendered animation. */
export function slotsKey(overrides?: LottieSlotOverrides): string {
	if (!overrides) return "";
	const image = Object.fromEntries(Object.entries(overrides.image ?? {}).map(([id, o]) => [id, { ...o, src: `${o.src.length}:${o.src.slice(-32)}` }]));
	return JSON.stringify({ t: overrides.text ?? {}, i: image, h: overrides.hidden ?? [] });
}
