import type { MaskableElement, VisualElement } from "./types";
import type { ParamValues } from "@/params";
import type { PackIndexAsset } from "@/lottie/catalog";
import type { LottieElementData } from "@/lottie/types";
import type { MediaTime } from "@/wasm";

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

export type TimelineDragData =
	| MediaDragData
	| TextDragData
	| StickerDragData
	| GraphicDragData
	| EffectDragData;
