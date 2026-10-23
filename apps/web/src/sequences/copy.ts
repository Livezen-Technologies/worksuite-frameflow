import type { ElementPatch } from "@/project-settings/reflow";
import type { SceneTracks, TimelineTrack } from "@/timeline";
import { generateUUID } from "@/utils/id";

/**
 * A new sequence starts as a copy of another (ED-18): same sources, new ids
 * so clips in one sequence never collide with the other's.
 */
export function copyTracks(tracks: SceneTracks): SceneTracks {
	const copy = <T extends TimelineTrack>(track: T): T => ({
		...track,
		id: generateUUID(),
		elements: track.elements.map((e) => ({ ...e, id: generateUUID() })),
	});
	return {
		main: copy(tracks.main),
		overlay: tracks.overlay.map(copy),
		audio: tracks.audio.map(copy),
	};
}

/** Applies reflow patches to tracks directly (no history: a fresh copy). */
export function applyPatches({
	tracks,
	patches,
}: {
	tracks: SceneTracks;
	patches: ElementPatch[];
}): SceneTracks {
	if (patches.length === 0) return tracks;
	const byId = new Map(patches.map((p) => [p.elementId, p.patch]));
	const patch = <T extends TimelineTrack>(track: T): T => ({
		...track,
		elements: track.elements.map((e) => {
			const p = byId.get(e.id);
			if (!p) return e;
			return {
				...e,
				...p,
				params: { ...e.params, ...(p.params ?? {}) },
			};
		}),
	});
	return {
		main: patch(tracks.main),
		overlay: tracks.overlay.map(patch),
		audio: tracks.audio.map(patch),
	};
}
