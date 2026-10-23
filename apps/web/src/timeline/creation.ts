import { mediaTime, mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";

export const DEFAULT_NEW_ELEMENT_DURATION = mediaTime({
	ticks: 5 * TICKS_PER_SECOND,
});

let stillSeconds = 5;

/** Length of a new still image or element; set from the project's defaults (PS-17). */
export function setDefaultStillSeconds({ seconds }: { seconds: number }) {
	if (Number.isFinite(seconds) && seconds > 0) stillSeconds = seconds;
}

export function defaultStillDuration() {
	return mediaTimeFromSeconds({ seconds: stillSeconds });
}

export function toElementDurationTicks({
	seconds,
}: {
	seconds: number | null | undefined;
}) {
	if (seconds == null) {
		return defaultStillDuration();
	}

	return mediaTimeFromSeconds({ seconds });
}
