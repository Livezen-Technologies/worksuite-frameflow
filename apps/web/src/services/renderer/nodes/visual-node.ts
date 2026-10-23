import type { ScreenStyle } from "@/screen-style/types";
import type { CursorLog } from "@/screen-zoom/types";
import type { ScreenZoom } from "@/screen-zoom/types";
import type { ProjectionDescriptor } from "@/vr/projection";
import type { ParamValues } from "@/params";
import type { ClipTransitionTiming } from "@/transitions/windows";
import { BaseNode } from "./base-node";
import type { Effect, EffectPass } from "@/effects/types";
import type { Mask } from "@/masks/types";
import type { BlendMode, Transform } from "@/rendering";
import type { RetimeConfig, VisualElement } from "@/timeline";

/** A clip's part in the transitions at its edges (see scene-builder). */
export interface NodeTransitions {
	timing: ClipTransitionTiming;
	canvasWidth: number;
	canvasHeight: number;
}

export interface VisualNodeParams {
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	retime?: RetimeConfig;
	transform: Transform;
	animations?: VisualElement["animations"];
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	masks?: Mask[];
	transitions?: NodeTransitions;
	/** The element's animation.* params, when it has an In/Out/Combo animation. */
	clipAnimation?: ParamValues;
	/** Zoom segments on a video clip (SC-11–SC-18). */
	screenZoom?: ScreenZoom;
	/** Cursor, keys and background styling for a screen recording (SC-07, SC-15, SC-17). */
	screenStyle?: ScreenStyle;
	/** The recording's input log, for drawing the cursor and keys. */
	screenLog?: CursorLog;
}

export interface ResolvedVisualNodeState {
	localTime: number;
	transform: Transform;
	opacity: number;
	effectPasses: EffectPass[][];
	/** Draws a 360° source through a virtual camera (VR-08). */
	projection?: ProjectionDescriptor;
	/** Replaces the clip's own mask while a transition reveals it. */
	maskOverride?: Mask;
}

export interface ResolvedVisualSourceNodeState extends ResolvedVisualNodeState {
	source: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
	/** Source time of the frame shown, for screen styling. */
	sourceSeconds?: number;
}

export abstract class VisualNode<
	Params extends VisualNodeParams = VisualNodeParams,
	Resolved extends ResolvedVisualNodeState = ResolvedVisualNodeState,
> extends BaseNode<Params, Resolved> {}
