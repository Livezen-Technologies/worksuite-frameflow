import type { EditorCore } from "@/core";
import { resyncCaptions } from "./anchor";

/**
 * After each edit, anchored captions follow their speech (SRS AI-45).
 * Runs as a command reactor, so undo restores both the edit and the
 * captions together from the command's snapshot.
 */
export function registerCaptionSync({ editor }: { editor: EditorCore }) {
	let expected = new Map<string, { startTime: number; duration: number } | null>();
	editor.command.registerReactor(() => {
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return;
		const result = resyncCaptions({ tracks: scene.tracks, previous: expected });
		expected = result.expected;
		if (result.updates.length === 0) return;
		const byId = new Map(result.updates.map((u) => [u.elementId, u.patch]));
		const tracks = scene.tracks;
		editor.timeline.updateTracks({
			...tracks,
			overlay: tracks.overlay.map((track) =>
				track.type !== "text"
					? track
					: {
							...track,
							elements: track.elements.map((element) => {
								const patch = byId.get(element.id);
								return patch ? { ...element, ...patch } : element;
							}),
						},
			),
		});
	});
}
