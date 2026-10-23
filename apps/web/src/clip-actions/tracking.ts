"use client";

import type { EditorCore } from "@/core";
import type { TextElement, TimelineElement } from "@/timeline";
import { hasMediaId, isVisualElement } from "@/timeline/element-utils";
import { TICKS_PER_SECOND } from "@/wasm";
import { type ClipRef, mediaOf } from "./actions";
import { trackPatch } from "./analysis";
import { keyframesOn, sampleClip } from "./enhance";

/**
 * Motion tracking for text and stickers: the text follows whatever is
 * under it in the video below. Its position becomes keyframes, so the
 * path can be adjusted afterwards.
 */
const ANALYSIS_WIDTH = 320;

/** The video clip under `element` at the playhead, if any. */
export function videoUnder({
	editor,
	element,
}: {
	editor: EditorCore;
	element: TimelineElement;
}): ClipRef | null {
	const time = editor.playback.getCurrentTime();
	const tracks = editor.scenes.getActiveScene().tracks;
	for (const track of [tracks.main, ...[...tracks.overlay].reverse()]) {
		for (const candidate of track.elements) {
			if (
				candidate.id === element.id ||
				!isVisualElement(candidate) ||
				!hasMediaId(candidate)
			)
				continue;
			if (mediaOf({ editor, element: candidate })?.type !== "video") continue;
			if (
				time >= candidate.startTime &&
				time < candidate.startTime + candidate.duration
			) {
				return { trackId: track.id, element: candidate };
			}
		}
	}
	return null;
}

export async function trackText({
	editor,
	text,
	onProgress,
}: {
	editor: EditorCore;
	text: { trackId: string; element: TextElement };
	onProgress?: (fraction: number) => void;
}): Promise<number> {
	const video = videoUnder({ editor, element: text.element });
	if (!video)
		throw new Error("Put the text over a video clip, with the playhead on it.");
	const asset = mediaOf({ editor, element: video.element });
	if (!asset?.width || !asset.height)
		throw new Error("Couldn't read the video's size.");
	const time = editor.playback.getCurrentTime();
	const end = Math.min(
		text.element.startTime + text.element.duration,
		video.element.startTime + video.element.duration,
	);
	const samples = await sampleClip({
		editor,
		clip: video,
		perSecond: 15,
		fromSeconds: (time - video.element.startTime) / TICKS_PER_SECOND,
		toSeconds: (end - video.element.startTime) / TICKS_PER_SECOND,
		analysisWidth: ANALYSIS_WIDTH,
		onProgress,
	});
	// Canvas pixels per analysed pixel, from how the video is placed.
	const frame = editor.project.getActive().settings.canvasSize;
	const contain = Math.min(
		frame.width / asset.width,
		frame.height / asset.height,
	);
	const scale =
		Math.abs(Number(video.element.params["transform.scaleX"] ?? 1)) || 1;
	const perPixel = (asset.width * contain * scale) / samples.width;
	const videoX = Number(video.element.params["transform.positionX"] ?? 0);
	const videoY = Number(video.element.params["transform.positionY"] ?? 0);
	const textX = Number(text.element.params["transform.positionX"] ?? 0);
	const textY = Number(text.element.params["transform.positionY"] ?? 0);
	const cx = (textX - videoX) / perPixel + samples.width / 2;
	const cy = (textY - videoY) / perPixel + samples.height / 2;
	const path = trackPatch({
		frames: samples.frames,
		width: samples.width,
		height: samples.height,
		cx,
		cy,
		r: Math.max(6, Math.round(samples.width * 0.04)),
		range: 14,
	});
	const start = path[0] ?? { x: cx, y: cy };
	// Sample times are video-local; keyframes are text-local.
	const textTimes = samples.times.map(
		(t) => t + video.element.startTime - text.element.startTime,
	);
	let animations = keyframesOn({
		animations: text.element.animations,
		path: "transform.positionX",
		times: textTimes,
		values: path.map((p) => textX + (p.x - start.x) * perPixel),
	});
	animations = keyframesOn({
		animations,
		path: "transform.positionY",
		times: textTimes,
		values: path.map((p) => textY + (p.y - start.y) * perPixel),
	});
	editor.timeline.updateElements({
		updates: [
			{
				trackId: text.trackId,
				elementId: text.element.id,
				patch: { animations },
			},
		],
	});
	return path.length;
}

export function clearTracking({
	editor,
	text,
}: {
	editor: EditorCore;
	text: { trackId: string; element: TextElement };
}) {
	const animations = { ...(text.element.animations ?? {}) };
	delete animations["transform.positionX"];
	delete animations["transform.positionY"];
	editor.timeline.updateElements({
		updates: [
			{
				trackId: text.trackId,
				elementId: text.element.id,
				patch: { animations },
			},
		],
	});
}
