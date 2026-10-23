import type { SceneTracks, TimelineTrack } from "@/timeline/types";

/**
 * Narration source for transcription (SRS AI-44): only the chosen track's
 * audio is transcribed, so music and other voices don't confuse it.
 */
export function narrationSources(
	tracks: SceneTracks,
): { id: string; label: string }[] {
	const sources: { id: string; label: string }[] = [];
	const add = ({ track, kind }: { track: TimelineTrack; kind: string }) => {
		const clips = track.elements.filter((e) => "mediaId" in e);
		if (clips.length === 0) return;
		const first = clips[0]?.name ?? "";
		sources.push({
			id: track.id,
			label: `${kind}: ${first}${clips.length > 1 ? ` +${clips.length - 1}` : ""}`,
		});
	};
	for (const track of tracks.audio) add({ track, kind: "Audio track" });
	add({ track: tracks.main, kind: "Main video" });
	for (const track of tracks.overlay)
		if (track.type === "video") add({ track, kind: "Video track" });
	return sources;
}

/** The timeline with every other track's clips left out. */
export function onlyTrack({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): SceneTracks {
	const keep = <T extends TimelineTrack>(track: T): T =>
		track.id === trackId
			? { ...track, ...("muted" in track ? { muted: false } : {}) }
			: { ...track, elements: [] };
	return {
		main: keep(tracks.main),
		overlay: tracks.overlay.map(keep),
		audio: tracks.audio.map(keep),
	};
}
