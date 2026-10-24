"use client";

import type { EditorCore } from "@/core";
import { findPackAsset, MissingPackError } from "@/lottie/catalog";
import { insertAnimation } from "@/lottie/actions";
import type { LottieElementData } from "@/lottie/types";
import type { TimelineElement } from "@/timeline";
import { placeholderLottieData, resolvePlaceholderData } from "./placeholders";
import { ensureProjectPacks, useAssetLibrary } from "./store";

/** Every clip of every sequence in the open project. */
export function allProjectElements(editor: EditorCore): Array<{ trackId: string; element: TimelineElement }> {
	return editor.scenes.getScenes().flatMap((scene) =>
		[...scene.tracks.overlay, scene.tracks.main, ...scene.tracks.audio].flatMap((track) =>
			track.elements.map((element) => ({ trackId: track.id, element: element as TimelineElement })),
		),
	);
}

/**
 * Adds an asset from a catalog pack. Installed: the real clip. Not yet:
 * a placeholder clip now, and the pack downloads in the background.
 */
export async function addCatalogAsset({
	editor,
	packId,
	version,
	assetId,
	name,
}: {
	editor: EditorCore;
	packId: string;
	version: string;
	assetId: string;
	name?: string;
}): Promise<{ elementId: string; placeholder: boolean }> {
	try {
		const asset = await findPackAsset(assetId, { id: packId, version });
		if (asset) {
			const { addPackAnimation } = await import("@/lottie/actions");
			addPackAnimation({ editor, asset });
			return { elementId: "", placeholder: false };
		}
	} catch (error) {
		if (!(error instanceof MissingPackError)) throw error;
	}
	const lottie = placeholderLottieData({ packId, version, assetId });
	const { elementId } = insertAnimation({
		editor,
		name: name ?? assetId,
		lottie,
		params: { "transform.scaleX": 0.5, "transform.scaleY": 0.5 },
	});
	void useAssetLibrary.getState().install(packId);
	return { elementId, placeholder: true };
}

/** Gives resolved placeholders their real size and length (after a pack installs). */
export async function resolveProjectPlaceholders(editor: EditorCore): Promise<number> {
	const updates: Array<{ trackId: string; elementId: string; patch: { lottie: LottieElementData } }> = [];
	for (const { trackId, element } of allProjectElements(editor)) {
		const lottie = (element as { lottie?: LottieElementData }).lottie;
		if (!lottie?.placeholder || lottie.source.kind !== "pack") continue;
		try {
			const asset = await findPackAsset(lottie.source.assetId, lottie.source.pack);
			if (asset) updates.push({ trackId, elementId: element.id, patch: { lottie: resolvePlaceholderData(lottie, asset) } });
		} catch {
			// Still downloading.
		}
	}
	if (updates.length) editor.timeline.updateElements({ updates } as never);
	return updates.length;
}

/** Project open: fetch missing packs per the setting. */
export function checkProjectPacks(editor: EditorCore) {
	return ensureProjectPacks(allProjectElements(editor).map(({ element }) => element as never));
}
