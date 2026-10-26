import type { SpeedKeyframe } from "@/retime/curve";
import type { ScreenStyle } from "@/screen-style/types";
import type { CaptionAnchor } from "@/captions/anchor";
import type { TimedWord } from "@/captions/words";
import type { TCanvasSize } from "@/project/types";
import type { PrivacyRegion } from "@/privacy/region";
import type { MulticamTag } from "@/multicam/types";
import type { ScreenZoom } from "@/screen-zoom/types";
import type { ClipTransition } from "@/transitions/types";
import type { ElementAnimations } from "@/animation/types";
import type { Effect } from "@/effects/types";
import type { Mask } from "@/masks/types";
import type { ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";
import type { LottieElementData } from "@/lottie/types";
import type { TextAnimation } from "@/text-animation/types";
import type { TextStyleOverrides } from "@/text-animation/element-style";

export type ElementRef = {
	trackId: string;
	elementId: string;
};

export interface Bookmark {
	time: MediaTime;
	note?: string;
	color?: string;
	duration?: MediaTime;
}

export interface TScene {
	id: string;
	name: string;
	isMain: boolean;
	tracks: SceneTracks;
	bookmarks: Bookmark[];
	/** This sequence's frame (ED-18); unset follows the project's. */
	canvasSize?: TCanvasSize;
	/** Grade over the whole sequence, applied on top of every clip (WS-12). */
	grade?: TimelineGrade;
	createdAt: Date;
	updatedAt: Date;
}

export interface TimelineGrade {
	enabled: boolean;
	/** Colour nodes in order, the same effects clips use. */
	effects: Effect[];
}

export type TrackType = "video" | "text" | "audio" | "graphic" | "effect";

interface BaseTrack {
	id: string;
	name: string;
	/** Locked tracks can't be edited (SRS ED-14). */
	locked?: boolean;
}

export interface VideoTrack extends BaseTrack {
	type: "video";
	elements: (VideoElement | ImageElement)[];
	muted: boolean;
	hidden: boolean;
}

export interface TextTrack extends BaseTrack {
	type: "text";
	elements: TextElement[];
	hidden: boolean;
}

export interface AudioTrack extends BaseTrack {
	type: "audio";
	elements: AudioElement[];
	muted: boolean;
}

export interface GraphicTrack extends BaseTrack {
	type: "graphic";
	elements: (StickerElement | GraphicElement)[];
	hidden: boolean;
}

export interface EffectTrack extends BaseTrack {
	type: "effect";
	elements: EffectElement[];
	hidden: boolean;
}

export type TimelineTrack =
	| VideoTrack
	| TextTrack
	| AudioTrack
	| GraphicTrack
	| EffectTrack;

export type OverlayTrack = VideoTrack | TextTrack | GraphicTrack | EffectTrack;

export interface SceneTracks {
	overlay: OverlayTrack[];
	main: VideoTrack;
	audio: AudioTrack[];
}

export interface RetimeConfig {
	/** Constant speed; with a curve, the curve's average speed. */
	rate: number;
	maintainPitch?: boolean;
	/** Speed curve keyframes (non-destructive time remapping, see retime/curve.ts). */
	curve?: SpeedKeyframe[];
	/** Preset the curve came from ("custom" once edited). */
	curvePreset?: string;
	/** Play the clip backwards: the last source frame shown first. */
	reverse?: boolean;
}

interface BaseAudioElement extends BaseTimelineElement {
	type: "audio";
	buffer?: AudioBuffer;
	retime?: RetimeConfig;
	/** Voice clean-up made a new file from this one (AR-15). */
	voiceCleanup?: { originalMediaId: string };
	/** Takes recorded over this range (AR-06); the active one is what plays. */
	takes?: AudioTake[];
	activeTake?: number;
}

export interface AudioTake {
	label: string;
	mediaId: string;
	trimStart: MediaTime;
	trimEnd: MediaTime;
}

export interface UploadAudioElement extends BaseAudioElement {
	sourceType: "upload";
	mediaId: string;
}

export interface LibraryAudioElement extends BaseAudioElement {
	sourceType: "library";
	sourceUrl: string;
}

export type AudioElement = UploadAudioElement | LibraryAudioElement;

interface BaseTimelineElement {
	id: string;
	name: string;
	duration: MediaTime;
	startTime: MediaTime;
	trimStart: MediaTime;
	trimEnd: MediaTime;
	sourceDuration?: MediaTime;
	animations?: ElementAnimations;
	params: ParamValues;
}

export interface VideoElement extends BaseTimelineElement {
	type: "video";
	mediaId: string;
	isSourceAudioEnabled?: boolean;
	hidden?: boolean;
	retime?: RetimeConfig;
	effects?: Effect[];
	masks?: Mask[];
	/** Transition on the cut into this clip from the clip before it. */
	transitionIn?: ClipTransition;
	/** Auto or manual zoom, with the cursor log for screen recordings (SC-11–SC-18). */
	screenZoom?: ScreenZoom;
	/** Cursor, keys and background styling (SC-07, SC-15, SC-17). */
	screenStyle?: ScreenStyle;
	/** Part of a multicam clip (SC-24–SC-30). */
	multicam?: MulticamTag;
}

export interface ImageElement extends BaseTimelineElement {
	type: "image";
	mediaId: string;
	hidden?: boolean;
	effects?: Effect[];
	masks?: Mask[];
	/** Transition on the cut into this clip from the clip before it. */
	transitionIn?: ClipTransition;
}

export interface TextElement extends BaseTimelineElement {
	type: "text";
	hidden?: boolean;
	effects?: Effect[];
	/** Caption times kept against the source media (AI-45). */
	captionAnchor?: CaptionAnchor;
	/** Word timings in seconds from the caption's start (AI-46). */
	words?: TimedWord[];
	/** Per-letter/word/line animation (text-animation engine). */
	textAnimation?: TextAnimation;
	/** Looks beyond the params (gradient fill) used by animated text. */
	textStyle?: TextStyleOverrides;
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	/** Natural dimensions of the sticker asset, stored at insert time. Used by renderer and preview bounds to avoid split-brain geometry. */
	intrinsicWidth?: number;
	intrinsicHeight?: number;
	hidden?: boolean;
	effects?: Effect[];
}

export interface GraphicElement extends BaseTimelineElement {
	type: "graphic";
	definitionId: string;
	/** Set when this graphic is an animation (definitionId "lottie"). */
	lottie?: LottieElementData;
	hidden?: boolean;
	effects?: Effect[];
	masks?: Mask[];
}

export interface EffectElement extends BaseTimelineElement {
	type: "effect";
	effectType: string;
	/** Limits the effect to one area of the frame (privacy region, ED-15). */
	region?: PrivacyRegion;
}

export type ElementUpdatePatch = { params?: Partial<ParamValues> };

export type TimelineElement =
	| AudioElement
	| VideoElement
	| ImageElement
	| TextElement
	| StickerElement
	| GraphicElement
	| EffectElement;

export type ElementType = TimelineElement["type"];

function elementTypes<T extends ElementType[]>(...types: T): T {
	return types;
}

export const MASKABLE_ELEMENT_TYPES = elementTypes("video", "image", "graphic");

export type MaskableElement = Extract<
	TimelineElement,
	{ type: (typeof MASKABLE_ELEMENT_TYPES)[number] }
>;

export const RETIMABLE_ELEMENT_TYPES = elementTypes("video", "audio");

export type RetimableElement = Extract<
	TimelineElement,
	{ type: (typeof RETIMABLE_ELEMENT_TYPES)[number] }
>;

export const VISUAL_ELEMENT_TYPES = elementTypes(
	"video",
	"image",
	"text",
	"sticker",
	"graphic",
);

export type VisualElement = Extract<
	TimelineElement,
	{ type: (typeof VISUAL_ELEMENT_TYPES)[number] }
>;

export type CreateUploadAudioElement = Omit<UploadAudioElement, "id">;
export type CreateLibraryAudioElement = Omit<LibraryAudioElement, "id">;
export type CreateAudioElement =
	| CreateUploadAudioElement
	| CreateLibraryAudioElement;
export type CreateVideoElement = Omit<VideoElement, "id">;
export type CreateImageElement = Omit<ImageElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateGraphicElement = Omit<GraphicElement, "id">;
export type CreateEffectElement = Omit<EffectElement, "id">;
export type CreateTimelineElement =
	| CreateAudioElement
	| CreateVideoElement
	| CreateImageElement
	| CreateTextElement
	| CreateStickerElement
	| CreateGraphicElement
	| CreateEffectElement;

export interface ElementDragState {
	isDragging: boolean;
	elementId: string | null;
	dragElementIds: string[];
	dragTimeOffsets: Record<string, MediaTime>;
	trackId: string | null;
	startMouseX: number;
	startMouseY: number;
	startElementTime: MediaTime;
	clickOffsetTime: MediaTime;
	currentTime: MediaTime;
	currentMouseY: number;
}

export type ElementDragView =
	| { readonly kind: "idle" }
	| {
			readonly kind: "dragging";
			readonly anchorElementId: string;
			readonly trackId: string;
			readonly memberTimeOffsets: ReadonlyMap<string, MediaTime>;
			readonly startMouseX: number;
			readonly startMouseY: number;
			readonly startElementTime: MediaTime;
			readonly clickOffsetTime: MediaTime;
			readonly currentTime: MediaTime;
			readonly currentMouseX: number;
			readonly currentMouseY: number;
			readonly dropTarget: DropTarget | null;
	  };

export interface DropTarget {
	trackIndex: number;
	isNewTrack: boolean;
	insertPosition: "above" | "below" | null;
	xPosition: MediaTime;
	targetElement: { elementId: string; trackId: string } | null;
}

export interface ComputeDropTargetParams {
	elementType: ElementType;
	mouseX: number;
	mouseY: number;
	tracks: SceneTracks;
	playheadTime: MediaTime;
	isExternalDrop: boolean;
	elementDuration: MediaTime;
	pixelsPerSecond: number;
	zoomLevel: number;
	verticalDragDirection?: "up" | "down" | null;
	startTimeOverride?: MediaTime;
	excludeElementId?: string;
	targetElementTypes?: string[];
}

export interface ClipboardItem {
	trackId: string;
	trackType: TrackType;
	element: CreateTimelineElement;
}
