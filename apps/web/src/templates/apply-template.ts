"use client";

import {
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
} from "@/commands";
import type { Command } from "@/commands";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { ParamValues } from "@/params";
import type { CreateTimelineElement, TrackType } from "@/timeline";
import {
	buildElementFromMedia,
	buildGraphicElement,
	buildTextElement,
} from "@/timeline/element-utils";
import { DEFAULT_TRANSITION } from "@/transitions/types";
import { type MediaTime, mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import type { ProjectTemplate, TemplateLayer } from "./project-templates";

interface Frame {
	width: number;
	height: number;
}

const seconds = (value: number) => mediaTimeFromSeconds({ seconds: value });

/** Graphics are drawn from a square source contained in the frame. */
function shapeScale({
	frame,
	width,
	height,
}: {
	frame: Frame;
	width: number;
	height: number;
}) {
	const base = Math.min(frame.width, frame.height);
	return {
		"transform.scaleX": (width * frame.width) / base,
		"transform.scaleY": (height * frame.height) / base,
	};
}

/** Scale that makes a picture fill the frame (cover) instead of letterboxing. */
function coverScale({ frame, asset }: { frame: Frame; asset: MediaAsset }) {
	if (!asset.width || !asset.height) return 1;
	const contain = Math.min(
		frame.width / asset.width,
		frame.height / asset.height,
	);
	const cover = Math.max(
		frame.width / asset.width,
		frame.height / asset.height,
	);
	return cover / contain;
}

function position({
	frame,
	x = 0,
	y = 0,
}: {
	frame: Frame;
	x?: number;
	y?: number;
}): ParamValues {
	return {
		"transform.positionX": Math.round(x * frame.width),
		"transform.positionY": Math.round(y * frame.height),
	};
}

/** A logo already added to the project, for logo layers (SP-05). */
export interface TemplateLogo {
	mediaId: string;
	width: number;
	height: number;
	name: string;
}

function buildLayer({
	layer,
	media,
	frame,
	at,
	logo,
}: {
	layer: TemplateLayer;
	media: MediaAsset[];
	frame: Frame;
	at: MediaTime;
	logo?: TemplateLogo;
}): { trackType: TrackType; element: CreateTimelineElement; own?: boolean } | null {
	const startTime = roundMediaTime({ time: at + seconds(layer.start) });
	const duration = seconds(layer.duration);

	if (layer.kind === "logo") {
		if (!logo) return null;
		const built = buildElementFromMedia({
			mediaId: logo.mediaId,
			mediaType: "image",
			name: logo.name,
			duration,
			startTime,
		});
		// Images are drawn contained in the frame at scale 1: fit that in the box.
		const contain = Math.min(frame.width / logo.width, frame.height / logo.height);
		const scale = Math.min(
			(layer.width * frame.width) / (logo.width * contain),
			(layer.height * frame.height) / (logo.height * contain),
		);
		const element = {
			...built,
			params: {
				...built.params,
				"transform.scaleX": scale,
				"transform.scaleY": scale,
				...position({ frame, x: layer.x, y: layer.y }),
				...(layer.animation ?? {}),
			},
		} as CreateTimelineElement;
		return { trackType: "video", element, own: true };
	}

	if (layer.kind === "text") {
		const element = buildTextElement({
			raw: {
				name: layer.content.split("\n")[0].slice(0, 32),
				duration,
				params: {
					...layer.style,
					content: layer.content,
					...position({ frame, x: layer.x, y: layer.y }),
				},
			},
			startTime,
		});
		return { trackType: "text", element };
	}

	if (layer.kind === "shape") {
		const element = buildGraphicElement({
			definitionId: layer.definitionId,
			startTime,
			params: {
				fill: layer.fill,
				cornerRadius: layer.cornerRadius ?? 0,
				opacity: layer.opacity ?? 1,
				...shapeScale({ frame, width: layer.width, height: layer.height }),
				...position({ frame, x: layer.x, y: layer.y }),
				...(layer.animation ?? {}),
			},
		});
		return { trackType: "graphic", element: { ...element, duration } };
	}

	const visual = media.filter((m) => m.type === "image" || m.type === "video");
	const asset = visual.length > 0 ? visual[layer.slot % visual.length] : null;
	const transitionIn = layer.transitionIn
		? { ...DEFAULT_TRANSITION, type: layer.transitionIn }
		: undefined;

	if (!asset) {
		// No media yet: a coloured card holds the slot.
		const element = buildGraphicElement({
			definitionId: "rectangle",
			name: `Media ${layer.slot + 1}`,
			startTime,
			params: {
				fill: layer.color,
				...shapeScale({ frame, width: 1, height: 1 }),
				...(layer.animation ?? {}),
			},
		});
		return { trackType: "graphic", element: { ...element, duration } };
	}

	const sourceDuration =
		asset.type === "video" && asset.duration
			? seconds(asset.duration)
			: duration;
	const built = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: asset.type,
		name: asset.name,
		duration:
			asset.type === "video"
				? roundMediaTime({ time: Math.min(duration, sourceDuration) })
				: duration,
		startTime,
	});
	const scale = coverScale({ frame, asset });
	const element = {
		...built,
		...(asset.type === "video" ? { sourceDuration } : {}),
		...(transitionIn ? { transitionIn } : {}),
		params: {
			...built.params,
			"transform.scaleX": scale,
			"transform.scaleY": scale,
			...(layer.animation ?? {}),
		},
	} as CreateTimelineElement;
	return { trackType: "video", element };
}

/**
 * Adds a template at `at` as one undo step. Each kind of layer gets its own
 * new track, so the template never overwrites clips that are already there.
 */
export function applyTemplate({
	editor,
	template,
	media,
	at,
}: {
	editor: EditorCore;
	template: ProjectTemplate;
	media: MediaAsset[];
	at: MediaTime;
}): void {
	editor.command.execute({
		command: buildTemplateCommand({ editor, template, media, at }),
	});
}

/** The commands that add a template, for batching several into one undo step. */
export function buildTemplateCommand({
	editor,
	template,
	media,
	at,
	logo,
}: {
	editor: EditorCore;
	template: ProjectTemplate;
	media: MediaAsset[];
	at: MediaTime;
	logo?: TemplateLogo;
}): Command {
	const frame = editor.project.getActive().settings.canvasSize;
	const built = template.layers.flatMap((layer) => {
		const one = buildLayer({ layer, media, frame, at, logo });
		return one ? [one] : [];
	});

	// Media slides share a track (their transitions need neighbours); shapes
	// and texts get one track each so overlapping layers stack in order.
	const commands: Command[] = [];
	const inserts: Command[] = [];
	let mediaTrack: string | null = null;
	let index = 0;
	for (const { trackType, element, own } of built.reverse()) {
		let trackId: string;
		const isSlide = trackType === "video" && !own;
		if (isSlide && mediaTrack) {
			trackId = mediaTrack;
		} else {
			const add = new AddTrackCommand({ type: trackType, index: index++ });
			trackId = add.getTrackId();
			commands.push(add);
			if (isSlide) mediaTrack = trackId;
		}
		inserts.push(
			new InsertElementCommand({
				element,
				placement: { mode: "explicit", trackId },
			}),
		);
	}
	return new BatchCommand([...commands, ...inserts]);
}
