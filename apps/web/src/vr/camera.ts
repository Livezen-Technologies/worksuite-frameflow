"use client";

import {
	buildEffectParamPath,
	getElementLocalTime,
	hasKeyframesForPath,
	resolveEffectParamsAtTime,
	upsertPathKeyframe,
} from "@/animation";
import type { EditorCore } from "@/core";
import { coerceParamValue, getParamChannelLayout } from "@/params";
import type { VisualElement } from "@/timeline";
import { isVisualElement } from "@/timeline/element-utils";
import { mediaTime } from "@/wasm";
import { findReframeEffect, nearestYaw, REFRAME_PARAMS } from "./projection";

export type CameraKey = "yaw" | "pitch" | "roll" | "fov" | "lens";
export const CAMERA_KEYS: CameraKey[] = ["yaw", "pitch", "roll", "fov", "lens"];

export interface CameraTarget {
	trackId: string;
	element: VisualElement;
}

/** The selected clip with a 360° camera, if any. */
export function selectedCamera(editor: EditorCore): CameraTarget | null {
	const selected = editor.selection.getSelectedElements();
	if (selected.length !== 1) return null;
	const [found] = editor.timeline.getElementsWithTracks({ elements: selected });
	if (!found || !isVisualElement(found.element)) return null;
	if (!findReframeEffect(found.element.effects)) return null;
	return { trackId: found.track.id, element: found.element };
}

function localTimeOf({
	editor,
	element,
}: {
	editor: EditorCore;
	element: VisualElement;
}) {
	return mediaTime({
		ticks: getElementLocalTime({
			timelineTime: editor.playback.getCurrentTime(),
			elementStartTime: element.startTime,
			elementDuration: element.duration,
		}),
	});
}

/** The camera's values at the playhead. */
export function cameraAtPlayhead({
	editor,
	element,
}: {
	editor: EditorCore;
	element: VisualElement;
}): Record<CameraKey, number> {
	const effect = findReframeEffect(element.effects);
	const params = effect
		? resolveEffectParamsAtTime({
				effectId: effect.id,
				params: effect.params,
				animations: element.animations,
				localTime: localTimeOf({ editor, element }),
			})
		: {};
	const value = (key: CameraKey): number => {
		const raw = params[key];
		const fallback = REFRAME_PARAMS.find((p) => p.key === key)?.default;
		if (typeof raw === "number") return raw;
		return typeof fallback === "number" ? fallback : 0;
	};
	return {
		yaw: value("yaw"),
		pitch: value("pitch"),
		roll: value("roll"),
		fov: value("fov"),
		lens: value("lens"),
	};
}

/**
 * Sets camera values at the playhead: a value already animated gets a
 * keyframe there, otherwise the clip's static value changes. With
 * `keyframe`, every given value is keyframed (VR-09 "add a keyframe").
 */
export function setCamera({
	editor,
	target,
	values,
	keyframe = false,
	preview = false,
}: {
	editor: EditorCore;
	target: CameraTarget;
	values: Partial<Record<CameraKey | "mode", number | string>>;
	keyframe?: boolean;
	preview?: boolean;
}): void {
	const { element, trackId } = target;
	const effect = findReframeEffect(element.effects);
	if (!effect) return;
	const time = localTimeOf({ editor, element });
	let animations = element.animations;
	let params = { ...effect.params };
	for (const [key, raw] of Object.entries(values)) {
		const param = REFRAME_PARAMS.find((p) => p.key === key);
		if (!param || raw === undefined) continue;
		const propertyPath = buildEffectParamPath({
			effectId: effect.id,
			paramKey: key,
		});
		const animated = hasKeyframesForPath({ animations, propertyPath });
		let value = raw;
		if (key === "yaw" && typeof raw === "number" && (animated || keyframe)) {
			const current = cameraAtPlayhead({ editor, element }).yaw;
			value = nearestYaw({ from: current, target: raw });
		}
		if (param.keyframable !== false && (animated || keyframe)) {
			animations = upsertPathKeyframe({
				animations,
				propertyPath,
				time,
				value,
				channelLayout: getParamChannelLayout({ param }),
				coerceValue: ({ value: next }) =>
					coerceParamValue({ param, value: next }),
			});
		} else {
			params = { ...params, [key]: value };
		}
	}
	const patch: Partial<VisualElement> = {
		effects: (element.effects ?? []).map((e) =>
			e.id === effect.id ? { ...e, params } : e,
		),
		animations,
	};
	if (preview) {
		editor.timeline.previewElements({
			updates: [{ trackId, elementId: element.id, updates: patch }],
		});
	} else {
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch }],
		});
	}
}
