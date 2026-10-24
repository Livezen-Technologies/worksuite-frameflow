import type { ParamValues } from "@/params";
import { type PackIndexAsset, resolvePackVariant } from "./catalog";
import type { LottieColorSlot, LottieElementData, LottieJson, LottieSource } from "./types";

/** Default size per category, as a share of the frame (contain-fitted). */
export const CATEGORY_SCALE: Record<string, number | "cover"> = {
	"lower-thirds": 1,
	transitions: "cover",
	"call-to-action": 0.4,
	callouts: 0.5,
	reactions: 0.6,
	"sri-lanka-seasonal": 0.5,
	"status-infographics": 0.4,
	"subscribe-buttons": 0.45,
};

/** Transform scale so a w×h source fills `scale` of the frame (or covers it). */
export function lottieInsertScale({
	width,
	height,
	frame,
	scale,
}: {
	width: number;
	height: number;
	frame: { width: number; height: number };
	scale: number | "cover";
}): ParamValues {
	if (scale !== "cover") return { "transform.scaleX": scale, "transform.scaleY": scale };
	const contain = Math.min(frame.width / width, frame.height / height);
	const cover = Math.max(frame.width / width, frame.height / height);
	const factor = cover / contain;
	return { "transform.scaleX": factor, "transform.scaleY": factor };
}

export function lottieDataFromPackAsset(asset: PackIndexAsset, variant?: string | null): LottieElementData {
	const fps = 30;
	const resolved = resolvePackVariant(asset, variant);
	return {
		source: {
			kind: "pack",
			assetId: asset.id,
			...(resolved ? { variant: resolved } : {}),
			...(asset.pack ? { pack: { ...asset.pack } } : {}),
		},
		colors: {},
		width: asset.width,
		height: asset.height,
		fps,
		frames: Math.round(asset.durationSec * fps),
		loop: asset.loop,
		speed: 1,
	};
}

export function lottieDataFromJson({
	source,
	json,
}: {
	source: LottieSource;
	json: LottieJson;
}): LottieElementData {
	return {
		source,
		colors: {},
		width: json.w,
		height: json.h,
		fps: json.fr,
		frames: Math.max(1, json.op - json.ip),
		loop: true,
		speed: 1,
	};
}

export function packAssetInsertParams({
	asset,
	frame,
}: {
	asset: PackIndexAsset;
	frame: { width: number; height: number };
}): ParamValues {
	return lottieInsertScale({
		width: asset.width,
		height: asset.height,
		frame,
		scale: CATEGORY_SCALE[asset.category] ?? 0.5,
	});
}

/** The colour each slot draws with, after the element's overrides. */
export function resolveSlotColors({
	slots,
	overrides,
}: {
	slots: LottieColorSlot[];
	overrides: Record<string, string>;
}): Array<LottieColorSlot & { value: string }> {
	return slots.map((slot) => ({
		...slot,
		value: overrides[slot.default.toUpperCase()] ?? overrides[slot.default] ?? slot.default,
	}));
}

/** Overrides after setting one slot; setting it back to its default drops it. */
export function setSlotColor({
	overrides,
	slot,
	color,
}: {
	overrides: Record<string, string>;
	slot: LottieColorSlot;
	color: string;
}): Record<string, string> {
	const key = slot.default.toUpperCase();
	const next = { ...overrides };
	const value = color.toUpperCase();
	if (value === key) delete next[key];
	else next[key] = value;
	return next;
}

/**
 * Brand colours on an animation: a picked `color` goes to its main (first)
 * slot; otherwise the brand colours fill the slots in order, repeating.
 */
export function brandColorOverrides({
	slots,
	brandColors,
	color,
}: {
	slots: LottieColorSlot[];
	brandColors: string[];
	color?: string;
}): Record<string, string> {
	if (color) return slots[0] ? setSlotColor({ overrides: {}, slot: slots[0], color }) : {};
	let overrides: Record<string, string> = {};
	slots.forEach((slot, index) => {
		const brand = brandColors[index % Math.max(1, brandColors.length)];
		if (brand) overrides = setSlotColor({ overrides, slot, color: brand });
	});
	return overrides;
}

/**
 * The same clip in another language: only the source changes, so colours,
 * speed, looping and timing stay as they are (variants share timing and
 * colour slots). An unknown variant leaves the clip unchanged.
 */
export function switchLottieVariant({
	data,
	asset,
	variant,
}: {
	data: LottieElementData;
	asset: Pick<PackIndexAsset, "id" | "variants" | "defaultVariant">;
	variant: string;
}): LottieElementData {
	if (data.source.kind !== "pack" || data.source.assetId !== asset.id) return data;
	if (!asset.variants?.some((v) => v.id === variant)) return data;
	return { ...data, source: { kind: "pack", assetId: asset.id, variant } };
}
