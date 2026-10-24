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
import { packSoundElements } from "./sounds";
import { importUserLottieFile, type UserLottie } from "./user-library";
import type { ImportedAnimation } from "./io/import";

function durationOf(data: LottieElementData): MediaTime {
	return roundMediaTime({
		time: mediaTimeFromSeconds({ seconds: data.frames / data.fps / data.speed }),
	});
}

function frameOf(editor: EditorCore) {
	return editor.project.getActive().settings.canvasSize;
}

export function insertAnimation({
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
}): { elementId: string; startTime: MediaTime } {
	const start = startTime ?? editor.playback.getCurrentTime();
	const elementId = editor.timeline.insertElement({
		element: buildGraphicElement({
			definitionId: LOTTIE_GRAPHIC_DEFINITION_ID,
			name,
			startTime: start,
			params,
			lottie,
			duration: durationOf(lottie),
		}),
		placement: { mode: "auto" },
	});
	return { elementId, startTime: start };
}

/**
 * Places a library animation's sound effects on audio tracks, timed from
 * `startTime`, and leaves the animation clip (`elementId`) selected on its
 * own so Properties shows its controls and "Edit motion…" (without one, the
 * sounds are selected). The timeline has no clip linking, so they move
 * separately. Returns the sound clips' ids.
 */
export function addPackAnimationSounds({
	editor,
	asset,
	startTime,
	elementId,
}: {
	editor: EditorCore;
	asset: PackIndexAsset;
	startTime: MediaTime;
	elementId?: string;
}): string[] {
	const ids = packSoundElements({ asset, startTime }).map((element) =>
		editor.timeline.insertElement({ element, placement: { mode: "auto", trackType: "audio" } }),
	);
	if (ids.length) {
		const refs = (elementId ? [elementId] : ids).flatMap((id) => {
			const trackId = editor.timeline.findTrackIdForElement({ elementId: id });
			return trackId ? [{ trackId, elementId: id }] : [];
		});
		editor.selection.setSelectedElements({ elements: refs });
	}
	return ids;
}

/** Adds a library animation at the playhead on a free layer. */
export function addPackAnimation({
	editor,
	asset,
	variant,
	startTime,
	withSound = true,
}: {
	editor: EditorCore;
	asset: PackIndexAsset;
	/** Language variant; the asset's default when absent. */
	variant?: string | null;
	startTime?: MediaTime;
	/** Also place the animation's sound effects (default on). */
	withSound?: boolean;
}) {
	const inserted = insertAnimation({
		editor,
		name: asset.name,
		lottie: lottieDataFromPackAsset(asset, variant),
		params: packAssetInsertParams({ asset, frame: frameOf(editor) }),
		startTime,
	});
	if (withSound) addPackAnimationSounds({ editor, asset, ...inserted });
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
	withSound = true,
}: {
	asset: PackIndexAsset;
	frame: { width: number; height: number };
	variant?: string | null;
	withSound?: boolean;
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
		...(withSound && asset.sounds?.length ? { packAsset: asset } : {}),
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
	pick,
}: {
	editor: EditorCore;
	files: File[];
	/** Chooses among the animations of a multi-animation .lottie. */
	pick?: (choices: ImportedAnimation[]) => Promise<ImportedAnimation[]>;
}): Promise<{ imported: UserLottie[]; failed: Array<{ name: string; reason: string }> }> {
	const imported: UserLottie[] = [];
	const failed: Array<{ name: string; reason: string }> = [];
	for (const file of files) {
		try {
			for (const entry of await importUserLottieFile(file, pick)) {
				addUserAnimation({ editor, entry });
				imported.push(entry);
			}
		} catch (error) {
			failed.push({ name: file.name, reason: error instanceof Error ? error.message : "Unknown error" });
		}
	}
	return { imported, failed };
}
