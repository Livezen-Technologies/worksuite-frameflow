import {
	DEFAULT_TONE_MAP,
	type ToneMapSettings,
	type Transfer,
} from "./tonemap";

/** How one piece of media should be read and mapped (HD-05, HD-08). */
export interface MediaHdrSettings extends Partial<ToneMapSettings> {
	/** Override for files whose colour metadata is missing or wrong. */
	source?: "auto" | Transfer;
}

export interface ProjectHdrSettings {
	/** Brightness of SDR white (graphics, titles, SDR clips) in HDR projects (HD-04, HD-12). */
	graphicsWhiteNits?: number;
	/** Project-wide tone mapping for HDR footage. */
	toneMap?: Partial<ToneMapSettings>;
	media?: Record<string, MediaHdrSettings>;
}

/**
 * The open project's HDR settings, read by the video cache when it opens a
 * clip's decoder. Kept outside React so the cache needs no editor import.
 */
let current: ProjectHdrSettings = {};
/** The project's output: SDR, or an HDR project working in HLG signal. */
export type ColorMode = "sdr" | "hlg" | "pq";
let colorMode: ColorMode = "sdr";

export function getColorMode(): ColorMode {
	return colorMode;
}

export function isHdrProject(): boolean {
	return colorMode !== "sdr";
}

export function getGraphicsWhiteNits(): number {
	return current.graphicsWhiteNits ?? 203;
}

/** Sets the project colour mode; HDR decoders reopen with the new output. */
export function setColorMode({ mode }: { mode: ColorMode }) {
	if (mode === colorMode) return;
	colorMode = mode;
	for (const listener of listeners) listener(["*"]);
}
const listeners = new Set<(changedMedia: string[]) => void>();

export function setProjectHdrSettings({
	settings,
}: {
	settings: ProjectHdrSettings | undefined;
}) {
	const next = settings ?? {};
	const ids = new Set([
		...Object.keys(current.media ?? {}),
		...Object.keys(next.media ?? {}),
	]);
	const projectChanged =
		JSON.stringify(current.toneMap ?? {}) !==
		JSON.stringify(next.toneMap ?? {});
	const changed = [...ids].filter(
		(id) =>
			projectChanged ||
			JSON.stringify(current.media?.[id]) !== JSON.stringify(next.media?.[id]),
	);
	current = next;
	for (const listener of listeners) listener(projectChanged ? ["*"] : changed);
}

export function onHdrSettingsChange(
	listener: (changedMedia: string[]) => void,
) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The transfer and mapping to use for a media item given its metadata. */
export function resolveMediaHdr({
	mediaId,
	detected,
}: {
	mediaId: string;
	detected: Transfer;
}): { transfer: Transfer; settings: ToneMapSettings; output: "sdr" | "hlg" } {
	const media = current.media?.[mediaId] ?? {};
	const transfer =
		media.source && media.source !== "auto" ? media.source : detected;
	return {
		transfer,
		// HDR projects keep HDR footage as HLG signal; SDR projects tone-map it.
		output: colorMode === "sdr" ? "sdr" : "hlg",
		settings: {
			rolloff:
				media.rolloff ?? current.toneMap?.rolloff ?? DEFAULT_TONE_MAP.rolloff,
			saturation:
				media.saturation ??
				current.toneMap?.saturation ??
				DEFAULT_TONE_MAP.saturation,
			exposure:
				media.exposure ??
				current.toneMap?.exposure ??
				DEFAULT_TONE_MAP.exposure,
		},
	};
}

/** Maps the browser's VideoColorSpace transfer name to ours. */
export function transferFromColorSpace(
	transfer: string | null | undefined,
): Transfer {
	if (transfer === "hlg" || transfer === "arib-std-b67") return "hlg";
	if (transfer === "pq" || transfer === "smpte2084") return "pq";
	return "sdr";
}
