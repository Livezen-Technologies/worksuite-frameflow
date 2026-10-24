"use client";

import type { EditorCore } from "@/core";
import type { ParamValues } from "@/params";
import { buildGraphicElement } from "@/timeline/element-utils";
import type { TimelineDragData } from "@/timeline/drag";
import { mediaTimeFromSeconds, roundMediaTime, type MediaTime } from "@/wasm";
import type { PackIndexAsset } from "./catalog";
import {
	lottieDataFromJson,
	lottieDataFromPackAsset,
	lottieInsertScale,
	packAssetInsertParams,
} from "./element";
import { type LottieElementData, LOTTIE_GRAPHIC_DEFINITION_ID } from "./types";
import { importUserLottie, type UserLottie } from "./user-library";

function durationOf(data: LottieElementData): MediaTime {
	return roundMediaTime({
		time: mediaTimeFromSeconds({ seconds: data.frames / data.fps / data.speed }),
	});
}

function frameOf(editor: EditorCore) {
	return editor.project.getActive().settings.canvasSize;
}

function insertAnimation({
	editor,
	name,
	lottie,
	params,
	startTime,
}: {
	editor: EditorCore;
	name: string;
	lottie: LottieElementData;
	params: ParamValues;
	startTime?: MediaTime;
}) {
	editor.timeline.insertElement({
		element: buildGraphicElement({
			definitionId: LOTTIE_GRAPHIC_DEFINITION_ID,
			name,
			startTime: startTime ?? editor.playback.getCurrentTime(),
			params,
			lottie,
			duration: durationOf(lottie),
		}),
		placement: { mode: "auto" },
	});
}

/** Adds a library animation at the playhead on a free layer. */
export function addPackAnimation({
	editor,
	asset,
	variant,
	startTime,
}: {
	editor: EditorCore;
	asset: PackIndexAsset;
	/** Language variant; the asset's default when absent. */
	variant?: string | null;
	startTime?: MediaTime;
}) {
	insertAnimation({
		editor,
		name: asset.name,
		lottie: lottieDataFromPackAsset(asset, variant),
		params: packAssetInsertParams({ asset, frame: frameOf(editor) }),
		startTime,
	});
}

export function addUserAnimation({
	editor,
	entry,
	startTime,
}: {
	editor: EditorCore;
	entry: UserLottie;
	startTime?: MediaTime;
}) {
	insertAnimation({
		editor,
		name: entry.name,
		lottie: lottieDataFromJson({ source: { kind: "user", id: entry.id }, json: entry.json }),
		params: lottieInsertScale({
			width: entry.json.w,
			height: entry.json.h,
			frame: frameOf(editor),
			scale: 0.6,
		}),
		startTime,
	});
}

/** What the timeline gets when a library animation is dragged onto it. */
export function packAnimationDragData({
	asset,
	frame,
	variant,
}: {
	asset: PackIndexAsset;
	frame: { width: number; height: number };
	variant?: string | null;
}): TimelineDragData {
	const lottie = lottieDataFromPackAsset(asset, variant);
	return {
		type: "graphic",
		id: asset.id,
		name: asset.name,
		definitionId: LOTTIE_GRAPHIC_DEFINITION_ID,
		params: packAssetInsertParams({ asset, frame }),
		lottie,
		duration: durationOf(lottie),
	};
}

export function userAnimationDragData({
	entry,
	frame,
}: {
	entry: UserLottie;
	frame: { width: number; height: number };
}): TimelineDragData {
	const lottie = lottieDataFromJson({ source: { kind: "user", id: entry.id }, json: entry.json });
	return {
		type: "graphic",
		id: entry.id,
		name: entry.name,
		definitionId: LOTTIE_GRAPHIC_DEFINITION_ID,
		params: lottieInsertScale({ width: entry.json.w, height: entry.json.h, frame, scale: 0.6 }),
		lottie,
		duration: durationOf(lottie),
	};
}

/**
 * Imports Lottie .json files from the media bin: each is stored on this
 * device and added at the playhead. Returns what was imported and why
 * anything was skipped.
 */
export async function importLottieFiles({
	editor,
	files,
}: {
	editor: EditorCore;
	files: File[];
}): Promise<{ imported: UserLottie[]; failed: Array<{ name: string; reason: string }> }> {
	const imported: UserLottie[] = [];
	const failed: Array<{ name: string; reason: string }> = [];
	for (const file of files) {
		try {
			const entry = await importUserLottie(file);
			addUserAnimation({ editor, entry });
			imported.push(entry);
		} catch (error) {
			failed.push({ name: file.name, reason: error instanceof Error ? error.message : "Unknown error" });
		}
	}
	return { imported, failed };
}
