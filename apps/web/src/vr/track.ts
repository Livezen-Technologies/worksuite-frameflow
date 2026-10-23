"use client";

import { buildEffectParamPath } from "@/animation";
import { trackPatch } from "@/clip-actions/analysis";
import { keyframesOn, sampleClip } from "@/clip-actions/enhance";
import type { EditorCore } from "@/core";
import { TICKS_PER_SECOND } from "@/wasm";
import { type CameraTarget, cameraAtPlayhead } from "./camera";
import {
	directionToUv,
	findReframeEffect,
	nearestYaw,
	uvToDirection,
} from "./projection";

/**
 * Follows the subject in the middle of the 360° camera's view from the
 * playhead to the end of the clip (SRS VR-13): the subject is tracked in the
 * equirectangular frames, across the seam, and the camera's pan and tilt
 * get keyframes that keep it centred.
 */
export async function followSubject({
	editor,
	target,
	onProgress,
}: {
	editor: EditorCore;
	target: CameraTarget;
	onProgress?: (fraction: number) => void;
}): Promise<number> {
	const { element, trackId } = target;
	const effect = findReframeEffect(element.effects);
	if (!effect) throw new Error("This clip has no 360° camera.");
	const start = cameraAtPlayhead({ editor, element });
	const fromSeconds = Math.max(
		0,
		(editor.playback.getCurrentTime() - element.startTime) / TICKS_PER_SECOND,
	);
	const samples = await sampleClip({
		editor,
		clip: { trackId, element },
		perSecond: 10,
		fromSeconds,
		analysisWidth: 480,
		onProgress,
	});
	const { width, height } = samples;
	const uv = directionToUv(start);
	const path = trackPatch({
		frames: samples.frames,
		width,
		height,
		cx: (((uv.u % 1) + 1) % 1) * width,
		cy: uv.v * height,
		r: Math.max(6, Math.round(width * 0.025)),
		range: 16,
		wrapX: true,
	});
	if (path.length === 0) return 0;
	const base = path[0];
	let yaw = start.yaw;
	const yaws: number[] = [];
	const pitches: number[] = [];
	for (const p of path) {
		// Turn by how far the subject moved, from where the camera started.
		const moved = uvToDirection({
			u: uv.u + (p.x - base.x) / width,
			v: uv.v + (p.y - base.y) / height,
		});
		yaw = nearestYaw({ from: yaw, target: moved.yaw });
		yaws.push(yaw);
		pitches.push(moved.pitch);
	}
	const times = samples.times.slice(0, path.length);
	let animations = keyframesOn({
		animations: element.animations,
		path: buildEffectParamPath({ effectId: effect.id, paramKey: "yaw" }),
		times,
		values: yaws,
	});
	animations = keyframesOn({
		animations,
		path: buildEffectParamPath({ effectId: effect.id, paramKey: "pitch" }),
		times,
		values: pitches,
	});
	editor.timeline.updateElements({
		updates: [{ trackId, elementId: element.id, patch: { animations } }],
	});
	return path.length;
}
