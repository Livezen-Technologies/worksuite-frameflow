"use client";

import { useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { forgetUserAnimation } from "@/lottie/player";
import type { TimelineTrack } from "@/timeline/types";
import { onMotionPublished } from "../video-link";

/** In the video editor: redraws clips whose Motion Studio animation was just updated. */
export function MotionLinkSync() {
	const editor = useEditor();
	useEffect(
		() =>
			onMotionPublished((message) => {
				forgetUserAnimation(message.id);
				const scene = editor.scenes.getActiveSceneOrNull();
				if (scene) {
					const tracks = Object.values(scene.tracks).flatMap((t): TimelineTrack[] => (Array.isArray(t) ? t : t ? [t] : []));
					const updates = tracks.flatMap((track) =>
						track.elements.flatMap((element) => {
							const lottie = "lottie" in element ? element.lottie : undefined;
							if (!lottie || lottie.source.kind !== "user" || lottie.source.id !== message.id) return [];
							return [
								{
									trackId: track.id,
									elementId: element.id,
									patch: { lottie: { ...lottie, fps: message.fps, frames: message.frames, width: message.width, height: message.height } },
								},
							];
						}),
					);
					if (updates.length) editor.timeline.updateElements({ updates });
				}
				editor.playback.seek({ time: editor.playback.getCurrentTime() });
			}),
		[editor],
	);
	return null;
}
