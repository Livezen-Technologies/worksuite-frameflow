"use client";

import { buildEffectParamPath, upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import type { EditorCore } from "@/core";
import { coerceParamValue, getParamChannelLayout } from "@/params";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";
import type { CameraTarget } from "./camera";
import { readMotion } from "./gpmf";
import {
	correctionFor,
	type HorizonMode,
	orientationAt,
	orientationsOf,
} from "./horizon";
import { findReframeEffect, nearestYaw, REFRAME_PARAMS } from "./projection";

/** Keyframes per second: smooth enough for hand-held shake, light to edit. */
const RATE = 10;

export type HorizonResult =
	| { ok: true; keyframes: number }
	| { ok: false; reason: "no-media" | "no-motion" };

/**
 * Levels (or fully steadies) a 360° clip from the motion data its camera
 * recorded: yaw, pitch and roll of its 360° camera get keyframes that undo
 * the camera's tilt (VR-04, VR-12). The clip's own aim is kept on top.
 */
export async function applyHorizonLock({
	editor,
	target,
	mode,
}: {
	editor: EditorCore;
	target: CameraTarget;
	mode: HorizonMode;
}): Promise<HorizonResult> {
	const { element, trackId } = target;
	const effect = findReframeEffect(element.effects);
	const mediaId = "mediaId" in element ? element.mediaId : null;
	const asset = mediaId
		? editor.media.getAssets().find((a) => a.id === mediaId)
		: undefined;
	if (!effect || !asset) return { ok: false, reason: "no-media" };
	const motion = await readMotion(asset.file);
	const track = motion && orientationsOf(motion);
	if (!track) return { ok: false, reason: "no-motion" };

	const base = (key: string) => {
		const v = effect.params[key];
		return typeof v === "number" ? v : 0;
	};
	const rate = ("retime" in element ? element.retime?.rate : undefined) ?? 1;
	const seconds = element.duration / TICKS_PER_SECOND;
	const trim = element.trimStart / TICKS_PER_SECOND;
	const count = Math.max(2, Math.ceil(seconds * RATE) + 1);

	let animations: ElementAnimations | undefined = { ...element.animations };
	for (const key of ["yaw", "pitch", "roll"]) {
		delete animations[buildEffectParamPath({ effectId: effect.id, paramKey: key })];
	}
	let yaw = base("yaw");
	for (let i = 0; i < count; i++) {
		const local = Math.min(seconds, i / RATE);
		const q = orientationAt({ ...track, time: trim + local * rate });
		const fix = correctionFor({ q, mode });
		yaw = nearestYaw({ from: yaw, target: base("yaw") + fix.yaw });
		const values = {
			yaw,
			pitch: Math.max(-90, Math.min(90, base("pitch") + fix.pitch)),
			roll: base("roll") + fix.roll,
		};
		for (const [key, value] of Object.entries(values)) {
			const param = REFRAME_PARAMS.find((p) => p.key === key);
			if (!param) continue;
			animations = upsertPathKeyframe({
				animations,
				propertyPath: buildEffectParamPath({ effectId: effect.id, paramKey: key }),
				time: mediaTime({ ticks: Math.round(local * TICKS_PER_SECOND) }),
				value,
				channelLayout: getParamChannelLayout({ param }),
				coerceValue: ({ value: next }) => coerceParamValue({ param, value: next }),
			});
		}
	}
	editor.timeline.updateElements({
		updates: [{ trackId, elementId: element.id, patch: { animations } }],
	});
	return { ok: true, keyframes: count };
}
