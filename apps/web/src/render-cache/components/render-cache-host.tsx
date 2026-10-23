"use client";

import { useEffect } from "react";
import { EditorCore } from "@/core";
import { renderCache } from "../service";
import { useRenderCacheSettings, useRenderCacheStatus } from "../store";

const IDLE_MS = 2000;

/** Opens each project's render cache and, in automatic mode, renders stale parts when idle. */
export function RenderCacheHost() {
	const mode = useRenderCacheSettings((s) => s.mode);
	const quality = useRenderCacheSettings((s) => s.quality);

	useEffect(() => {
		const editor = EditorCore.getInstance();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let projectId: string | null = null;
		const refresh = () =>
			useRenderCacheStatus
				.getState()
				.update({ segments: renderCache.status({ editor }) });
		const changed = () => {
			const active = editor.project.getActiveOrNull()?.metadata.id ?? null;
			if (active !== projectId) {
				projectId = active;
				if (active) void renderCache.open({ projectId: active }).then(refresh);
			}
			clearTimeout(timer);
			timer = setTimeout(() => {
				refresh();
				if (mode !== "auto" || !active) return;
				// Never compete with playback or an edit in progress.
				if (editor.playback.getIsPlaying() || editor.playback.getIsScrubbing())
					return changed();
				void renderCache.renderStale({ editor });
			}, IDLE_MS);
		};
		const offs = [
			editor.project.subscribe(changed),
			editor.scenes.subscribe(changed),
			editor.timeline.subscribe(changed),
			editor.media.subscribe(changed),
		];
		changed();
		return () => {
			clearTimeout(timer);
			for (const off of offs) off();
		};
	}, [mode, quality]);

	useEffect(() => {
		if (mode === "off") renderCache.cancel();
	}, [mode]);

	return null;
}
