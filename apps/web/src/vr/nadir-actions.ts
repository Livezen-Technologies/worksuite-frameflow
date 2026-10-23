"use client";

import { BatchCommand } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import { AddTrackCommand, InsertElementCommand } from "@/commands/timeline";
import type { EditorCore } from "@/core";
import { buildDefaultEffectInstance } from "@/effects";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { isVisualElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import { NADIR_EFFECT_TYPE } from "./nadir";
import { warpNadirLogo } from "./nadir-logo";
import { findReframeEffect } from "./projection";

/** Puts a nadir patch on every 360° clip that doesn't have one (VR-19). Returns how many. */
export function coverTripod({ editor }: { editor: EditorCore }): number {
	const tracks = editor.scenes.getActiveScene().tracks;
	const updates = [...tracks.overlay, tracks.main].flatMap((track) =>
		track.elements.flatMap((element) => {
			if (!isVisualElement(element) || !findReframeEffect(element.effects)) return [];
			if (element.effects?.some((e) => e.type === NADIR_EFFECT_TYPE)) return [];
			return [
				{
					trackId: track.id,
					elementId: element.id,
					patch: {
						effects: [...(element.effects ?? []), buildDefaultEffectInstance({ effectType: NADIR_EFFECT_TYPE })],
					},
				},
			];
		}),
	);
	if (updates.length) editor.timeline.updateElements({ updates });
	return updates.length;
}

/** A logo laid flat under the viewer, on its own top track for the whole video (VR-19). */
export async function addNadirLogo({
	editor,
	file,
	sizeDeg = 20,
}: {
	editor: EditorCore;
	file: File;
	sizeDeg?: number;
}): Promise<void> {
	const project = editor.project.getActive();
	const { width, height } = project.settings.canvasSize;
	const bitmap = await createImageBitmap(file);
	const read = new OffscreenCanvas(bitmap.width, bitmap.height);
	const readCtx = read.getContext("2d");
	if (!readCtx) throw new Error("Couldn't read the logo");
	readCtx.drawImage(bitmap, 0, 0);
	const logo = readCtx.getImageData(0, 0, bitmap.width, bitmap.height);
	const warped = warpNadirLogo({ logo, width, height, sizeDeg });
	const out = new OffscreenCanvas(width, height);
	const outCtx = out.getContext("2d");
	if (!outCtx) throw new Error("Couldn't draw the logo");
	const image = outCtx.createImageData(width, height);
	image.data.set(warped);
	outCtx.putImageData(image, 0, 0);
	const blob = await out.convertToBlob({ type: "image/png" });
	const name = `${file.name.replace(/\.[^.]+$/, "")} (nadir).png`;
	const [asset] = await processMediaAssets({ files: [new File([blob], name, { type: "image/png" })] });
	if (!asset) throw new Error("Couldn't add the logo");
	const addMedia = new AddMediaAssetCommand({ projectId: project.metadata.id, asset });
	const addTrack = new AddTrackCommand({ type: "video", index: 0 });
	const total = editor.timeline.getTotalDuration();
	const element = buildElementFromMedia({
		mediaId: addMedia.getAssetId(),
		mediaType: "image",
		name,
		duration: roundMediaTime({ time: Math.max(total, mediaTimeFromSeconds({ seconds: 5 })) }),
		startTime: roundMediaTime({ time: 0 }),
	});
	editor.command.execute({
		command: new BatchCommand([
			addMedia,
			addTrack,
			new InsertElementCommand({ element, placement: { mode: "explicit", trackId: addTrack.getTrackId() } }),
		]),
	});
}
