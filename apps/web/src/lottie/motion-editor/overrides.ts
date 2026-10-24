import type { PackIndexAsset } from "../catalog";
import { brandColorOverrides } from "../element";
import { carryOverrides } from "../slots";
import type { ImageSlotOverride, LottieElementData, LottieJson, TextSlotOverride } from "../types";

/*
 * Motion Editor edits as pure functions on a clip's LottieElementData.
 * Every edit is an override on the clip (asset reference + slot values),
 * never a change to the pack's files, so a pack update keeps them.
 */

/** Sets (or clears, with `null`) one text slot's override; empty overrides are dropped. */
export function setTextOverride(data: LottieElementData, slotId: string, patch: Partial<TextSlotOverride> | null): LottieElementData {
	const text = { ...(data.slots?.text ?? {}) };
	if (patch === null) delete text[slotId];
	else {
		const next = { ...(text[slotId] ?? {}), ...patch };
		for (const key of Object.keys(next) as Array<keyof TextSlotOverride>) if (next[key] === undefined) delete next[key];
		if (Object.keys(next).length) text[slotId] = next;
		else delete text[slotId];
	}
	return withSlots(data, { text: Object.keys(text).length ? text : undefined });
}

export function setImageOverride(data: LottieElementData, slotId: string, value: ImageSlotOverride | null): LottieElementData {
	const image = { ...(data.slots?.image ?? {}) };
	if (value === null) delete image[slotId];
	else image[slotId] = value;
	return withSlots(data, { image: Object.keys(image).length ? image : undefined });
}

/** Shows or hides a named layer (or slot layer). */
export function setLayerHidden(data: LottieElementData, layer: string, hidden: boolean): LottieElementData {
	const set = new Set(data.slots?.hidden ?? []);
	if (hidden) set.add(layer);
	else set.delete(layer);
	return withSlots(data, { hidden: set.size ? [...set] : undefined });
}

function withSlots(data: LottieElementData, patch: Partial<NonNullable<LottieElementData["slots"]>>): LottieElementData {
	const slots = { ...(data.slots ?? {}), ...patch };
	for (const key of Object.keys(slots) as Array<keyof typeof slots>) if (slots[key] === undefined) delete slots[key];
	const { slots: _old, ...rest } = data;
	return Object.keys(slots).length ? { ...rest, slots } : rest;
}

/** Timing edits (seconds). Zero values are dropped. */
export function setTiming(data: LottieElementData, patch: Partial<NonNullable<LottieElementData["timing"]>>): LottieElementData {
	const timing = { ...(data.timing ?? {}), ...patch };
	for (const key of Object.keys(timing) as Array<keyof typeof timing>) if (!timing[key]) delete timing[key];
	const { timing: _old, ...rest } = data;
	return Object.keys(timing).length ? { ...rest, timing } : rest;
}

export function setSoundOverride(data: LottieElementData, cue: number, patch: { muted?: boolean; url?: string; nudge?: number } | null): LottieElementData {
	const sounds = { ...(data.sounds ?? {}) };
	if (patch === null) delete sounds[String(cue)];
	else sounds[String(cue)] = { ...(sounds[String(cue)] ?? {}), ...patch };
	const { sounds: _old, ...rest } = data;
	return Object.keys(sounds).length ? { ...rest, sounds } : rest;
}

/** Brand kit colours on the colour slots, and its font on every text slot. */
export function applyBrandKit({
	data,
	asset,
	brandColors,
	brandFont,
}: {
	data: LottieElementData;
	asset: Pick<PackIndexAsset, "colors" | "textSlots">;
	brandColors: string[];
	brandFont?: string | null;
}): LottieElementData {
	let next: LottieElementData = brandColors.length ? { ...data, colors: brandColorOverrides({ slots: asset.colors, brandColors }) } : data;
	if (brandFont) for (const slot of asset.textSlots ?? []) next = setTextOverride(next, slot.id, { fontFamily: brandFont });
	return next;
}

/**
 * The clip after its pack moved to a new version: same overrides for the
 * slots and layers that still exist, the new version in the source.
 */
export function rebaseOnPackVersion({
	data,
	asset,
	json,
}: {
	data: LottieElementData;
	asset: Pick<PackIndexAsset, "textSlots" | "imageSlots" | "pack">;
	json: Pick<LottieJson, "layers">;
}): { data: LottieElementData; dropped: string[] } {
	const { overrides, dropped } = carryOverrides({
		overrides: data.slots,
		textSlots: asset.textSlots ?? [],
		imageSlots: asset.imageSlots ?? [],
		layerNames: (json.layers as Array<{ nm?: string }>).map((l) => l.nm ?? "").filter(Boolean),
	});
	const source = data.source.kind === "pack" && asset.pack ? { ...data.source, pack: { ...asset.pack } } : data.source;
	const { slots: _old, ...rest } = data;
	return { data: { ...rest, source, ...(Object.keys(overrides).length ? { slots: overrides } : {}) }, dropped };
}

/** Serialisable clip edits, for "Save as my asset" and round trips. */
export function serializeMotion(data: LottieElementData): string {
	return JSON.stringify(data);
}

export function parseMotion(text: string): LottieElementData {
	const parsed = JSON.parse(text) as LottieElementData;
	if (!parsed?.source || (parsed.source.kind !== "pack" && parsed.source.kind !== "user")) throw new Error("Not a motion clip");
	return parsed;
}

/**
 * Scales a picture so its longer side is at most `max` px and returns a
 * data URL (keeps projects small). Browser-only.
 */
export async function downscaleImage(blob: Blob, max = 512): Promise<{ src: string; width: number; height: number }> {
	const bitmap = await createImageBitmap(blob);
	const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
	return { src: canvas.toDataURL("image/png"), width, height };
}
