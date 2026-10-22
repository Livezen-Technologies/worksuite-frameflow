/**
 * Quality profiles and storage estimates (SRS PF-02, PF-04, AR-13).
 */
export type RecordingMode = "voiceover" | "screen" | "screen-camera" | "camera";

export type QualityProfile = "standard" | "high" | "max";

export const QUALITY_PROFILES: Record<
	QualityProfile,
	{ label: string; height: number; fps: number; videoBitsPerSecond: number }
> = {
	standard: {
		label: "1080p · 30 fps",
		height: 1080,
		fps: 30,
		videoBitsPerSecond: 8_000_000,
	},
	high: {
		label: "1440p · 60 fps",
		height: 1440,
		fps: 60,
		videoBitsPerSecond: 16_000_000,
	},
	max: {
		label: "4K · 60 fps",
		height: 2160,
		fps: 60,
		videoBitsPerSecond: 35_000_000,
	},
};

export const CAMERA_BITS_PER_SECOND = 5_000_000;
export const COMPRESSED_AUDIO_BITS_PER_SECOND = 128_000;
/** 48 kHz 16-bit PCM per channel. */
export const WAV_BYTES_PER_SECOND_PER_CHANNEL = 48_000 * 2;

/** Estimated bytes per minute for a mode and profile. */
export function bytesPerMinute({
	mode,
	profile,
	channelCount = 1,
}: {
	mode: RecordingMode;
	profile: QualityProfile;
	channelCount?: number;
}): number {
	const wav = WAV_BYTES_PER_SECOND_PER_CHANNEL * channelCount;
	if (mode === "voiceover") return wav * 60;
	const screen =
		mode === "camera" ? 0 : QUALITY_PROFILES[profile].videoBitsPerSecond / 8;
	const camera =
		mode === "screen-camera" || mode === "camera"
			? CAMERA_BITS_PER_SECOND / 8
			: 0;
	return (screen + camera + wav + COMPRESSED_AUDIO_BITS_PER_SECOND / 8) * 60;
}

export const LOW_SPACE_MINUTES = 10;

export function minutesOfSpace({
	availableBytes,
	perMinute,
}: {
	availableBytes: number | null;
	perMinute: number;
}): number | null {
	if (availableBytes === null || perMinute <= 0) return null;
	return availableBytes / perMinute;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	return `${Math.round(bytes / 1e3)} KB`;
}
