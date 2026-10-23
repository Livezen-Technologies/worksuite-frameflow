"use client";

import { buildEffectParamPath, upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import type { EditorCore } from "@/core";
import { getParamChannelLayout, type ParamDefinition } from "@/params";
import { effectsRegistry } from "@/effects";
import { DENOISE_EFFECT_TYPE } from "@/effects/definitions/stylise";
import { COLOR_GRADE_EFFECT_TYPE } from "@/effects/definitions/color-grade";
import type { Effect } from "@/effects/types";
import type { VisualElement } from "@/timeline";
import { isVisualElement } from "@/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";
import {
	type ClipRef,
	mediaOf,
	openVideo,
	seek,
	sourceSecondsAt,
} from "./actions";
import {
	estimateShift,
	flickerCorrection,
	meanOf,
	stabilizeOffsets,
	toLuma,
} from "./analysis";

/**
 * Basic-panel enhancements for video clips: Stabilize and Remove flicker
 * analyse the clip and write keyframes (position, exposure); Reduce image
 * noise adds a denoise effect.
 */
export const STABILIZE_PARAM = "stabilize.zoom";
const STABILIZE_ZOOM = 1.1;
const DEFLICKER_PREFIX = "deflicker-";
const ANALYSIS_WIDTH = 160;

const NUMBER_PARAM: ParamDefinition = {
	key: "value",
	label: "Value",
	type: "number",
	default: 0,
	min: -100000,
	max: 100000,
	step: 0.001,
};

export interface Samples {
	times: number[]; // local ticks
	frames: Float32Array[];
	width: number;
	height: number;
}

export async function sampleClip({
	editor,
	clip,
	perSecond,
	onProgress,
	fromSeconds = 0,
	toSeconds,
	analysisWidth = ANALYSIS_WIDTH,
}: {
	editor: EditorCore;
	clip: ClipRef;
	perSecond: number;
	onProgress?: (fraction: number) => void;
	/** Clip-local range to sample (default: the whole clip). */
	fromSeconds?: number;
	toSeconds?: number;
	analysisWidth?: number;
}): Promise<Samples> {
	const asset = mediaOf({ editor, element: clip.element });
	if (!asset?.url || asset.type !== "video")
		throw new Error("This works on video clips.");
	const video = await openVideo(asset.url);
	const width = ANALYSIS_WIDTH;
	const height = Math.max(
		8,
		Math.round(
			(ANALYSIS_WIDTH * video.videoHeight) / Math.max(1, video.videoWidth),
		),
	);
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Canvas unavailable");
	const seconds = Math.min(
		clip.element.duration / TICKS_PER_SECOND,
		toSeconds ?? Number.POSITIVE_INFINITY,
	);
	const step = Math.max(1 / perSecond, (seconds - fromSeconds) / 900);
	const samples: Samples = { times: [], frames: [], width, height };
	for (let t = fromSeconds; t <= seconds; t += step) {
		await seek({
			video,
			seconds: sourceSecondsAt({
				element: clip.element,
				timelineTime: clip.element.startTime + t * TICKS_PER_SECOND,
			}),
		});
		ctx.drawImage(video, 0, 0, width, height);
		samples.times.push(Math.round(t * TICKS_PER_SECOND));
		samples.frames.push(toLuma(ctx.getImageData(0, 0, width, height).data));
		onProgress?.((t - fromSeconds) / Math.max(1e-6, seconds - fromSeconds));
	}
	video.removeAttribute("src");
	video.load();
	return samples;
}

export function keyframesOn({
	animations,
	path,
	times,
	values,
}: {
	animations: ElementAnimations | undefined;
	path: string;
	times: number[];
	values: number[];
}): ElementAnimations | undefined {
	let next = animations;
	times.forEach((time, i) => {
		next = upsertPathKeyframe({
			animations: next,
			propertyPath: path,
			time: mediaTime({ ticks: time }),
			value: values[i] ?? 0,
			channelLayout: getParamChannelLayout({ param: NUMBER_PARAM }),
			coerceValue: ({ value }) => (typeof value === "number" ? value : null),
		});
	});
	return next;
}

function withoutPaths({
	animations,
	paths,
}: {
	animations: ElementAnimations | undefined;
	paths: string[];
}): ElementAnimations | undefined {
	if (!animations) return animations;
	const next = { ...animations };
	for (const p of paths) delete next[p];
	return next;
}

export const isStabilized = (element: VisualElement) =>
	Number(element.params[STABILIZE_PARAM] ?? 0) > 0;
export const hasDeflicker = (element: VisualElement) =>
	!!element.effects?.some((e) => e.id.startsWith(DEFLICKER_PREFIX));
export const hasDenoise = (element: VisualElement) =>
	!!element.effects?.some((e) => e.type === DENOISE_EFFECT_TYPE);

export async function setStabilize({
	editor,
	clip,
	on,
	onProgress,
}: {
	editor: EditorCore;
	clip: ClipRef;
	on: boolean;
	onProgress?: (fraction: number) => void;
}) {
	const { element, trackId } = clip;
	if (!isVisualElement(element)) return;
	const paths = ["transform.positionX", "transform.positionY"];
	const sx = Number(element.params["transform.scaleX"] ?? 1);
	const sy = Number(element.params["transform.scaleY"] ?? 1);
	if (!on) {
		const zoom = Number(element.params[STABILIZE_PARAM] ?? 1) || 1;
		const { [STABILIZE_PARAM]: _zoom, ...params } = element.params;
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						params: {
							...params,
							"transform.scaleX": sx / zoom,
							"transform.scaleY": sy / zoom,
						},
						animations: withoutPaths({ animations: element.animations, paths }),
					},
				},
			],
		});
		return;
	}
	if (paths.some((p) => element.animations?.[p])) {
		throw new Error(
			"This clip already has position keyframes. Remove them to stabilize it.",
		);
	}
	const asset = mediaOf({ editor, element });
	const samples = await sampleClip({ editor, clip, perSecond: 12, onProgress });
	const shifts = samples.frames.slice(1).map((frame, i) =>
		estimateShift({
			a: samples.frames[i] ?? frame,
			b: frame,
			width: samples.width,
			height: samples.height,
		}),
	);
	// The 10% zoom leaves 5% of the frame on each side to move into.
	const offsets = stabilizeOffsets({
		shifts,
		window: 25,
		limit: (samples.width * (STABILIZE_ZOOM - 1)) / 2 / STABILIZE_ZOOM,
	});
	// Analysed pixels → canvas pixels, at the zoomed size.
	const frame = editor.project.getActive().settings.canvasSize;
	const srcW = asset?.width ?? samples.width;
	const srcH = asset?.height ?? samples.height;
	const contain = Math.min(frame.width / srcW, frame.height / srcH);
	const toCanvas =
		(srcW * contain * Math.abs(sx) * STABILIZE_ZOOM) / samples.width;
	const baseX = Number(element.params["transform.positionX"] ?? 0);
	const baseY = Number(element.params["transform.positionY"] ?? 0);
	let animations = keyframesOn({
		animations: element.animations,
		path: "transform.positionX",
		times: samples.times,
		values: offsets.map((o) => baseX + o.x * toCanvas),
	});
	animations = keyframesOn({
		animations,
		path: "transform.positionY",
		times: samples.times,
		values: offsets.map((o) => baseY + o.y * toCanvas),
	});
	editor.timeline.updateElements({
		updates: [
			{
				trackId,
				elementId: element.id,
				patch: {
					params: {
						...element.params,
						[STABILIZE_PARAM]: STABILIZE_ZOOM,
						"transform.scaleX": sx * STABILIZE_ZOOM,
						"transform.scaleY": sy * STABILIZE_ZOOM,
					},
					animations,
				},
			},
		],
	});
}

function defaultParams(type: string) {
	return Object.fromEntries(
		effectsRegistry.get(type).params.map((p) => [p.key, p.default]),
	);
}

export async function setDeflicker({
	editor,
	clip,
	on,
	onProgress,
}: {
	editor: EditorCore;
	clip: ClipRef;
	on: boolean;
	onProgress?: (fraction: number) => void;
}) {
	const { element, trackId } = clip;
	if (!isVisualElement(element)) return;
	const existing =
		element.effects?.filter((e) => e.id.startsWith(DEFLICKER_PREFIX)) ?? [];
	const cleaned = {
		effects: (element.effects ?? []).filter(
			(e) => !e.id.startsWith(DEFLICKER_PREFIX),
		),
		animations: withoutPaths({
			animations: element.animations,
			paths: existing.map((e) =>
				buildEffectParamPath({ effectId: e.id, paramKey: "exposure" }),
			),
		}),
	};
	if (!on) {
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: cleaned }],
		});
		return;
	}
	const samples = await sampleClip({ editor, clip, perSecond: 10, onProgress });
	const means = samples.frames.map((f) => meanOf(f));
	const fix = flickerCorrection({ means, window: 11 });
	const effect: Effect = {
		id: `${DEFLICKER_PREFIX}${generateUUID()}`,
		type: COLOR_GRADE_EFFECT_TYPE,
		enabled: true,
		params: defaultParams(COLOR_GRADE_EFFECT_TYPE),
	};
	editor.timeline.updateElements({
		updates: [
			{
				trackId,
				elementId: element.id,
				patch: {
					effects: [effect, ...cleaned.effects],
					animations: keyframesOn({
						animations: cleaned.animations,
						path: buildEffectParamPath({
							effectId: effect.id,
							paramKey: "exposure",
						}),
						times: samples.times,
						values: fix,
					}),
				},
			},
		],
	});
}

export function setDenoise({
	editor,
	clip,
	on,
}: {
	editor: EditorCore;
	clip: ClipRef;
	on: boolean;
}) {
	const { element, trackId } = clip;
	if (!isVisualElement(element)) return;
	const rest = (element.effects ?? []).filter(
		(e) => e.type !== DENOISE_EFFECT_TYPE,
	);
	const effects = on
		? [
				{
					id: generateUUID(),
					type: DENOISE_EFFECT_TYPE,
					enabled: true,
					params: defaultParams(DENOISE_EFFECT_TYPE),
				},
				...rest,
			]
		: rest;
	editor.timeline.updateElements({
		updates: [{ trackId, elementId: element.id, patch: { effects } }],
	});
}
