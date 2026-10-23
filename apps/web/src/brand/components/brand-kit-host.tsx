"use client";

import { useEffect } from "react";
import { EditorCore } from "@/core";
import { setFreeTracks } from "@/timeline/placement";
import { switchBrandKit } from "../project-kits";

/**
 * Swaps in the open project's brand kit wherever the user is (PS-20), and
 * its track arrangement (PS-08).
 */
export function BrandKitHost() {
	useEffect(() => {
		const editor = EditorCore.getInstance();
		const sync = () => {
			if (editor.project.getIsLoading()) return;
			setFreeTracks(editor.project.getActiveOrNull()?.settings.arrangeLayers === "free");
			switchBrandKit({ projectId: editor.project.getActiveOrNull()?.metadata.id ?? null });
		};
		sync();
		return editor.project.subscribe(sync);
	}, []);
	return null;
}
