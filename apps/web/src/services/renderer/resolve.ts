import { wordIndexAt } from "@/captions/words";
import {
	findReframeEffect,
	type ProjectionDescriptor,
	projectionFromParams,
	REFRAME_EFFECT_TYPE,
} from "@/vr/projection";
import { screenZoomAt, zoomOffset } from "@/screen-zoom/evaluate";
import { previewSource } from "@/proxy/registry";
import { mediaTimeToSeconds, roundMediaTime, TICKS_PER_SECOND } from "@/wasm";
import {
	graphemeCount,
	readTextStyleEffects,
	textAnimationState,
} from "@/text/style";
import { getElementLocalTime } from "@/animation";
import { animationState } from "@/animation/clip-animation";
import { resolveEffectParamsAtTime } from "@/animation/effect-param-channel";
import {
	buildGaussianBlurPasses,
	intensityToSigma,
} from "@/effects/definitions/blur";
import { effectsRegistry, resolveEffectPasses } from "@/effects";
import { LUT_EFFECT_TYPE } from "@/effects/definitions/lut";
import { ensureLutUploaded } from "@/lut/library";
import type { Effect, EffectPass } from "@/effects/types";
import { getSourceTimeAtClipTime } from "@/retime";
import {
	DEFAULT_GRAPHIC_SOURCE_SIZE,
	resolveGraphicElementParamsAtTime,
} from "@/graphics";
import {
	buildTextBackgroundFromElement,
	getTextMeasurementContext,
	measureTextElement,
} from "@/text/measure-element";
import { resolveColorAtTime, resolveOpacityAtTime } from "@/animation/values";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { videoCache } from "@/services/video-cache/service";
import type { Transform } from "@/rendering";
import type { Mask } from "@/masks/types";
import { getDefaultBaseMaskParams } from "@/masks/builtin/box-like";
import {
	ease,
	transitionFrame,
	type TransitionMask,
} from "@/transitions/frame";
import type { CanvasRenderer } from "./canvas-renderer";
import type { AnyBaseNode } from "./nodes/base-node";
import {
	BlurBackgroundNode,
	type BackdropSource,
	type ResolvedBlurBackgroundNodeState,
} from "./nodes/blur-background-node";
import {
	EffectLayerNode,
	type ResolvedEffectLayerNodeState,
} from "./nodes/effect-layer-node";
import {
	GraphicNode,
	type ResolvedGraphicNodeState,
} from "./nodes/graphic-node";
import { ImageNode, loadImageSource } from "./nodes/image-node";
import { StickerNode, loadStickerSource } from "./nodes/sticker-node";
import { TextNode, type ResolvedTextNodeState } from "./nodes/text-node";
import { VideoNode } from "./nodes/video-node";
import type {
	ResolvedVisualNodeState,
	ResolvedVisualSourceNodeState,
	VisualNodeParams,
} from "./nodes/visual-node";

type ResolveContext = {
	renderer: CanvasRenderer;
	time: number;
};

export async function resolveRenderTree({
	node,
	renderer,
	time,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
	time: number;
}): Promise<void> {
	await resolveNode({
		node,
		context: {
			renderer,
			time,
		},
	});
}

async function resolveNode({
	node,
	context,
}: {
	node: AnyBaseNode;
	context: ResolveContext;
}): Promise<void> {
	if (node instanceof VideoNode) {
		node.resolved = await resolveVideoNode({ node, context });
	} else if (node instanceof ImageNode) {
		node.resolved = await resolveImageNode({ node, context });
	} else if (node instanceof StickerNode) {
		node.resolved = await resolveStickerNode({ node, context });
	} else if (node instanceof GraphicNode) {
		node.resolved = resolveGraphicNode({ node, context });
	} else if (node instanceof TextNode) {
		node.resolved = resolveTextNode({ node, context });
	} else if (node instanceof BlurBackgroundNode) {
		node.resolved = await resolveBlurBackgroundNode({ node, context });
	} else if (node instanceof EffectLayerNode) {
		node.resolved = resolveEffectLayerNode({ node, context });
	}

	await Promise.all(
		node.children.map((child) => resolveNode({ node: child, context })),
	);
}

function resolveEffectPassGroups({
	effects,
	animations,
	localTime,
	width,
	height,
}: {
	effects: Effect[] | undefined;
	animations: VisualNodeParams["animations"];
	localTime: number;
	width: number;
	height: number;
}): EffectPass[][] {
	return (effects ?? [])
		.filter((effect) => effect.enabled && effect.type !== REFRAME_EFFECT_TYPE)
		.map((effect) => {
			const resolvedParams = resolveEffectParamsAtTime({
				effectId: effect.id,
				params: effect.params,
				animations,
				localTime,
			});
			const definition = effectsRegistry.get(effect.type);
			if (effect.type === LUT_EFFECT_TYPE) {
				ensureLutUploaded(String(resolvedParams.lutId ?? ""));
			}
			return resolveEffectPasses({
				definition,
				effectParams: resolvedParams,
				width,
				height,
				time: localTime / TICKS_PER_SECOND,
			});
		});
}

/** The clip's 360° camera at this moment, if it has one (VR-08). */
function resolveProjection({
	effects,
	animations,
	localTime,
}: {
	effects: Effect[] | undefined;
	animations: VisualNodeParams["animations"];
	localTime: number;
}): ProjectionDescriptor | null {
	const effect = findReframeEffect(effects);
	if (!effect?.enabled) return null;
	return projectionFromParams(
		resolveEffectParamsAtTime({
			effectId: effect.id,
			params: effect.params,
			animations,
			localTime,
		}),
	);
}

/** Graphemes to show for a reveal, rounded to whole words or lines. */
function revealCount({
	content,
	reveal,
	unit,
}: {
	content: string;
	reveal: number;
	unit?: "word" | "line";
}): number {
	const total = graphemeCount(content);
	if (!unit) return Math.round(reveal * total);
	const parts =
		unit === "line" ? content.split(/(?<=\n)/) : content.split(/(?<=\s)(?=\S)/);
	const shown = Math.ceil(reveal * parts.length - 1e-9);
	return graphemeCount(parts.slice(0, Math.max(0, shown)).join(""));
}

function resolveVisualState({
	params,
	context,
	sourceWidth,
	sourceHeight,
}: {
	params: VisualNodeParams;
	context: ResolveContext;
	sourceWidth: number;
	sourceHeight: number;
}): ResolvedVisualNodeState | null {
	const sampleTime = getTransitionSampleTime({ params, time: context.time });
	if (sampleTime === null) {
		return null;
	}

	const localTime = getElementLocalTime({
		timelineTime: sampleTime,
		elementStartTime: params.timeOffset,
		elementDuration: params.duration,
	});
	const baseTransform = resolveTransformAtTime({
		baseTransform: params.transform,
		animations: params.animations,
		localTime,
	});
	const baseOpacity = resolveOpacityAtTime({
		baseOpacity: params.opacity,
		animations: params.animations,
		localTime,
	});
	const transition = applyTransitions({
		params,
		time: context.time,
		transform: baseTransform,
		opacity: baseOpacity,
		aspect: sourceWidth / Math.max(1, sourceHeight),
	});
	// In / Out / Combo animation (Animation panel); travel is the frame size.
	const animated = params.clipAnimation
		? animationState({
				params: params.clipAnimation,
				localSeconds: (sampleTime - params.timeOffset) / TICKS_PER_SECOND,
				durationSeconds: params.duration / TICKS_PER_SECOND,
			})
		: null;
	const animatedTransform = animated
		? {
				...transition.transform,
				scaleX: transition.transform.scaleX * animated.scale,
				scaleY: transition.transform.scaleY * animated.scale,
				rotate: transition.transform.rotate + animated.rotate,
				position: {
					x:
						transition.transform.position.x +
						animated.offsetX * context.renderer.width,
					y:
						transition.transform.position.y +
						animated.offsetY * context.renderer.height,
				},
			}
		: transition.transform;
	const zoomed = applyScreenZoom({
		params,
		sampleTime,
		transform: animatedTransform,
		width: sourceWidth,
		height: sourceHeight,
		context,
	});
	const transform = zoomed;
	const opacity = transition.opacity * (animated?.opacity ?? 1);
	const projection = resolveProjection({
		effects: params.effects,
		animations: params.animations,
		localTime,
	});
	const containScale = Math.min(
		context.renderer.width / sourceWidth,
		context.renderer.height / sourceHeight,
	);
	// A 360° clip is drawn across the whole frame by its virtual camera.
	const effectWidth = projection
		? context.renderer.width
		: Math.round(Math.abs(sourceWidth * containScale * transform.scaleX));
	const effectHeight = projection
		? context.renderer.height
		: Math.round(Math.abs(sourceHeight * containScale * transform.scaleY));

	const effectPasses = resolveEffectPassGroups({
		effects: params.effects,
		animations: params.animations,
		localTime,
		width: effectWidth,
		height: effectHeight,
	});
	if (transition.blur > 0) {
		effectPasses.push(
			buildGaussianBlurPasses({
				sigmaX: intensityToSigma({
					intensity: transition.blur,
					resolution: effectWidth,
					reference: 1920,
				}),
				sigmaY: intensityToSigma({
					intensity: transition.blur,
					resolution: effectHeight,
					reference: 1080,
				}),
			}),
		);
	}

	return {
		localTime,
		transform,
		opacity,
		effectPasses,
		...(projection ? { projection } : {}),
		...(transition.mask ? { maskOverride: transition.mask } : {}),
	};
}

/**
 * Screen-recording zoom (SC-11–SC-18): scale around the clip centre and
 * shift so the focus point stays put. Times are source seconds, so the
 * cursor log lines up however the clip is trimmed.
 */
function applyScreenZoom({
	params,
	sampleTime,
	transform,
	width,
	height,
	context,
}: {
	params: VisualNodeParams;
	sampleTime: number;
	transform: Transform;
	width: number;
	height: number;
	context: ResolveContext;
}): Transform {
	if (!params.screenZoom) return transform;
	const seconds =
		(params.trimStart + sampleTime - params.timeOffset) / TICKS_PER_SECOND;
	const zoom = screenZoomAt({ zoom: params.screenZoom, seconds });
	if (zoom.scale <= 1) return transform;
	const fit = Math.min(
		context.renderer.width / width,
		context.renderer.height / height,
	);
	const { dx, dy } = zoomOffset({
		scale: zoom.scale,
		x: zoom.x,
		y: zoom.y,
		width: width * fit * Math.abs(transform.scaleX),
		height: height * fit * Math.abs(transform.scaleY),
	});
	return {
		...transform,
		scaleX: transform.scaleX * zoom.scale,
		scaleY: transform.scaleY * zoom.scale,
		position: { x: transform.position.x + dx, y: transform.position.y + dy },
	};
}

/**
 * The time to draw a clip at, or null when it isn't on screen. Around a
 * transition a clip shows past its own edges, holding its first or last
 * frame (SRS WS-19), so the time is clamped into the clip.
 */
function getTransitionSampleTime({
	params,
	time,
}: {
	params: VisualNodeParams;
	time: number;
}): number | null {
	const start = params.timeOffset;
	const end = params.timeOffset + params.duration;
	const timing = params.transitions?.timing;
	if (
		time < start - (timing?.holdBefore ?? 0) ||
		time >= end + (timing?.holdAfter ?? 0)
	) {
		return null;
	}
	return Math.min(Math.max(time, start), Math.max(start, end - 1));
}

function applyTransitions({
	params,
	time,
	transform,
	opacity,
	aspect,
}: {
	params: VisualNodeParams;
	time: number;
	transform: Transform;
	opacity: number;
	aspect: number;
}): { transform: Transform; opacity: number; blur: number; mask: Mask | null } {
	const result = { transform, opacity, blur: 0, mask: null as Mask | null };
	const transitions = params.transitions;
	if (!transitions) return result;

	const roles = [
		["in", transitions.timing.in],
		["out", transitions.timing.out],
	] as const;
	for (const [role, window] of roles) {
		if (!window || time < window.start || time >= window.end) continue;
		const { transition } = window;
		const progress = ease({
			easing: transition.easing,
			t: (time - window.start) / Math.max(1, window.end - window.start),
		});
		const frame = transitionFrame({
			type: transition.type,
			role,
			progress,
			direction: transition.direction,
			aspect,
		});
		result.transform = {
			scaleX: result.transform.scaleX * frame.scale,
			scaleY: result.transform.scaleY * frame.scale,
			position: {
				x:
					result.transform.position.x + frame.offsetX * transitions.canvasWidth,
				y:
					result.transform.position.y +
					frame.offsetY * transitions.canvasHeight,
			},
			rotate: result.transform.rotate + frame.rotate,
		};
		result.opacity *= frame.opacity;
		result.blur = Math.max(result.blur, frame.blur);
		if (frame.mask) result.mask = transitionMaskToMask(frame.mask);
	}
	return result;
}

function transitionMaskToMask(mask: TransitionMask): Mask {
	const params = {
		...getDefaultBaseMaskParams(),
		centerX: mask.shape === "rectangle" ? mask.centerX : 0,
		centerY: mask.shape === "rectangle" ? mask.centerY : 0,
		width: Math.max(mask.width, 0.0001),
		height: Math.max(mask.height, 0.0001),
		rotation: 0,
		scale: 1,
	};
	return { id: "transition", type: mask.shape, params };
}

async function resolveVideoNode({
	node,
	context,
}: {
	node: VideoNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const sampleTime = getTransitionSampleTime({
		params: node.params,
		time: context.time,
	});
	if (sampleTime === null) {
		return null;
	}
	const clipTime = sampleTime - node.params.timeOffset;

	const sourceTimeTicks =
		node.params.trimStart +
		getSourceTimeAtClipTime({
			clipTime,
			retime: node.params.retime,
		});
	const source = previewSource({
		mediaId: node.params.mediaId,
		file: node.params.file,
		useProxies: context.renderer.useProxies,
	});
	const frame = await videoCache.getFrameAt({
		mediaId: source.mediaId,
		file: source.file,
		time: mediaTimeToSeconds({
			time: roundMediaTime({ time: sourceTimeTicks }),
		}),
	});
	if (!frame) {
		return null;
	}

	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: frame.canvas.width,
		sourceHeight: frame.canvas.height,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: frame.canvas,
		sourceWidth: frame.canvas.width,
		sourceHeight: frame.canvas.height,
		sourceSeconds: sourceTimeTicks / TICKS_PER_SECOND,
	};
}

async function resolveImageNode({
	node,
	context,
}: {
	node: ImageNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const source = await loadImageSource({
		url: node.params.url,
		maxSourceSize: node.params.maxSourceSize,
	});
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: source.width,
		sourceHeight: source.height,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: source.source,
		sourceWidth: source.width,
		sourceHeight: source.height,
	};
}

async function resolveStickerNode({
	node,
	context,
}: {
	node: StickerNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const source = await loadStickerSource({ stickerId: node.params.stickerId });
	const sourceWidth = node.params.intrinsicWidth ?? source.width;
	const sourceHeight = node.params.intrinsicHeight ?? source.height;
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth,
		sourceHeight,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: source.source,
		sourceWidth,
		sourceHeight,
	};
}

function resolveGraphicNode({
	node,
	context,
}: {
	node: GraphicNode;
	context: ResolveContext;
}): ResolvedGraphicNodeState | null {
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: DEFAULT_GRAPHIC_SOURCE_SIZE,
		sourceHeight: DEFAULT_GRAPHIC_SOURCE_SIZE,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		resolvedParams: resolveGraphicElementParamsAtTime({
			element: node.params,
			localTime: visualState.localTime,
		}),
	};
}

function resolveTextNode({
	node,
	context,
}: {
	node: TextNode;
	context: ResolveContext;
}): ResolvedTextNodeState | null {
	if (
		context.time < node.params.startTime ||
		context.time >= node.params.startTime + node.params.duration
	) {
		return null;
	}

	const localTime = getElementLocalTime({
		timelineTime: context.time,
		elementStartTime: node.params.startTime,
		elementDuration: node.params.duration,
	});
	const background = buildTextBackgroundFromElement({ element: node.params });
	const measuredText = measureTextElement({
		element: node.params,
		canvasHeight: node.params.canvasHeight,
		localTime,
		ctx: getTextMeasurementContext(),
	});
	const animation = textAnimationState({
		params: node.params.params,
		localSeconds: localTime / TICKS_PER_SECOND,
		durationSeconds: node.params.duration / TICKS_PER_SECOND,
	});
	const styleEffects = readTextStyleEffects({
		params: node.params.params,
		fontSizePx: measuredText.scaledFontSize,
	});
	const words = node.params.words;
	if (node.params.params["animation.caption"] === "highlight" && words?.length) {
		const index = wordIndexAt({ words, seconds: localTime / TICKS_PER_SECOND });
		const color = node.params.params["animation.highlightColor"];
		if (index >= 0)
			styleEffects.highlightWord = {
				index,
				color: typeof color === "string" ? color : "#ffd400",
			};
	}
	if (animation.reveal < 1) {
		const content = String(node.params.params.content ?? "");
		styleEffects.revealGraphemes = revealCount({
			content,
			reveal: animation.reveal,
			unit: animation.revealUnit,
		});
	}
	const transform = resolveTransformAtTime({
		baseTransform: node.params.transform,
		animations: node.params.animations,
		localTime,
	});

	return {
		transform: {
			...transform,
			scaleX: transform.scaleX * animation.scale,
			scaleY: transform.scaleY * animation.scale,
			rotate: transform.rotate + animation.rotate,
			position: {
				x:
					transform.position.x +
					animation.offsetX *
						measuredText.scaledFontSize *
						transform.scaleX *
						3,
				y:
					transform.position.y +
					animation.offsetY * measuredText.scaledFontSize * transform.scaleY,
			},
		},
		opacity:
			resolveOpacityAtTime({
				baseOpacity: node.params.opacity,
				animations: node.params.animations,
				localTime,
			}) * animation.opacity,
		textColor: resolveColorAtTime({
			baseColor:
				typeof node.params.params.color === "string"
					? node.params.params.color
					: "#ffffff",
			animations: node.params.animations,
			propertyPath: "color",
			localTime,
		}),
		backgroundColor: resolveColorAtTime({
			baseColor: background.color,
			animations: node.params.animations,
			propertyPath: "background.color",
			localTime,
		}),
		effectPasses: resolveEffectPassGroups({
			effects: node.params.effects,
			animations: node.params.animations,
			localTime,
			width: context.renderer.width,
			height: context.renderer.height,
		}),
		measuredText,
		styleEffects,
	};
}

async function resolveBlurBackgroundNode({
	node,
	context,
}: {
	node: BlurBackgroundNode;
	context: ResolveContext;
}): Promise<ResolvedBlurBackgroundNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		return null;
	}

	const backdropSource = await resolveBackdropSource({ node, clipTime });
	if (!backdropSource) {
		return null;
	}

	return {
		backdropSource,
		passes: buildGaussianBlurPasses({
			sigmaX: intensityToSigma({
				intensity: node.params.blurIntensity,
				resolution: context.renderer.width,
				reference: 1920,
			}),
			sigmaY: intensityToSigma({
				intensity: node.params.blurIntensity,
				resolution: context.renderer.height,
				reference: 1080,
			}),
		}),
	};
}

async function resolveBackdropSource({
	node,
	clipTime,
}: {
	node: BlurBackgroundNode;
	clipTime: number;
}): Promise<BackdropSource | null> {
	if (node.params.mediaType === "video") {
		const sourceTimeTicks =
			node.params.trimStart +
			getSourceTimeAtClipTime({
				clipTime,
				retime: node.params.retime,
			});
		const frame = await videoCache.getFrameAt({
			mediaId: node.params.mediaId,
			file: node.params.file,
			time: mediaTimeToSeconds({
				time: roundMediaTime({ time: sourceTimeTicks }),
			}),
		});
		if (!frame) {
			return null;
		}

		return {
			source: frame.canvas,
			width: frame.canvas.width,
			height: frame.canvas.height,
		};
	}

	const source = await loadImageSource({ url: node.params.url });
	return {
		source: source.source,
		width: source.width,
		height: source.height,
	};
}

function resolveEffectLayerNode({
	node,
	context,
}: {
	node: EffectLayerNode;
	context: ResolveContext;
}): ResolvedEffectLayerNodeState | null {
	const time = context.time;
	if (
		time < node.params.timeOffset - 1e-6 ||
		time >= node.params.timeOffset + node.params.duration + 1e-6
	) {
		return null;
	}

	const definition = effectsRegistry.get(node.params.effectType);
	const passes = resolveEffectPasses({
		definition,
		effectParams: node.params.effectParams,
		width: context.renderer.width,
		height: context.renderer.height,
		time: (time - node.params.timeOffset) / TICKS_PER_SECOND,
	});
	if (passes.length === 0) {
		return null;
	}

	return {
		passes,
	};
}
