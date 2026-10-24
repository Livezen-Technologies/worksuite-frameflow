import type { MaskableElement, VisualElement } from "./types";
import type { ParamValues } from "@/params";
import type { PackIndexAsset } from "@/lottie/catalog";
import type { LottieElementData } from "@/lottie/types";
import type { MediaTime } from "@/wasm";
import type { TextAnimation } from "@/text-animation/types";
import type { PackType } from "@/asset-library/types";

interface BaseDragData {
	id: string;
	name: string;
}

export interface MediaDragData extends BaseDragData {
	type: "media";
	mediaType: "image" | "video" | "audio";
	targetElementTypes?: MaskableElement["type"][];
}

export interface TextDragData extends BaseDragData {
	type: "text";
	content: string;
	/** Style params for the new clip (Text library). */
	params?: Partial<ParamValues>;
	/** A Text library animation: added with the clip, or applied when dropped on a text clip. */
	textAnimation?: TextAnimation;
	/** Set with `textAnimation`: dropping on one of these applies instead of inserting. */
	targetElementTypes?: Array<"text">;
}

export interface StickerDragData extends BaseDragData {
	type: "sticker";
	stickerId: string;
}

export interface GraphicDragData extends BaseDragData {
	type: "graphic";
	definitionId: string;
	params: Partial<ParamValues>;
	/** Set when dragging an animation from the library. */
	lottie?: LottieElementData;
	duration?: MediaTime;
	/** A library animation whose sound effects are placed with it on drop. */
	packAsset?: PackIndexAsset;
}

export interface EffectDragData extends BaseDragData {
	type: "effect";
	effectType: string;
	targetElementTypes: VisualElement["type"][];
}

/**
 * A download-center pack (or one item of it) that may not be installed yet:
 * dropping it adds a placeholder, installs the pack and swaps in the real
 * clip / effect / LUT / transition (asset-library/apply-pack.ts).
 */
export interface PackDragData extends BaseDragData {
	type: "pack";
	packId: string;
	packType: PackType;
	itemId?: string | null;
	/** Apply-type packs (LUTs, filters, effects): dropping on one of these applies to it. */
	targetElementTypes?: VisualElement["type"][];
}

export type TimelineDragData =
	| PackDragData
	| MediaDragData
	| TextDragData
	| StickerDragData
	| GraphicDragData
	| EffectDragData;
