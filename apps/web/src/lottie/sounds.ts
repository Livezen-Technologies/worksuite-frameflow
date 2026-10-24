import { buildLibraryAudioElement } from "@/timeline/element-utils";
import type { CreateLibraryAudioElement } from "@/timeline/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds, roundMediaTime, type MediaTime } from "@/wasm";
import { type PackIndexAsset, packSoundPlacements } from "./catalog";

/**
 * The audio clips that go with a library animation starting at `startTime`:
 * one per sound cue, at start + `at`, with the cue's gain as its volume (dB).
 */
export function packSoundElements({
	asset,
	startTime,
}: {
	asset: Pick<PackIndexAsset, "name" | "sounds">;
	startTime: MediaTime;
}): CreateLibraryAudioElement[] {
	const time = (seconds: number) => roundMediaTime({ time: mediaTimeFromSeconds({ seconds }) });
	return packSoundPlacements({ asset, startSeconds: mediaTimeToSeconds({ time: startTime }) }).map((sound) => {
		const element = buildLibraryAudioElement({
			sourceUrl: sound.url,
			name: sound.name,
			duration: time(sound.durationSec),
			startTime: time(sound.startSeconds),
		});
		if (sound.volumeDb !== undefined) element.params = { ...element.params, volume: sound.volumeDb };
		return element;
	});
}
