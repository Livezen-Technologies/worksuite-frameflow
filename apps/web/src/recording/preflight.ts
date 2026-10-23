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

export type CheckStatus = "ok" | "warn" | "fail";

export interface CheckRow {
	id: "devices" | "resolution" | "frame-rate" | "encoder" | "disk";
	label: string;
	status: CheckStatus;
	detail: string;
}

/** Measured results of a setup test (PF-01). */
export interface PreflightMeasurements {
	/** Devices that couldn't be opened, with the reason. */
	failed: { device: string; reason: string }[];
	/** Each video source: what was asked for, what it delivers, and frames counted. */
	video: {
		device: string;
		wantHeight: number;
		height: number;
		wantFps: number;
		measuredFps: number;
		/** Screen capture only sends frames when something changes. */
		onChange?: boolean;
	}[];
	/** Frames the encoder managed per second at the recording size, or null when untested. */
	encoderFps: number | null;
	encoderNeedFps: number;
	/** Bytes per second written to recording storage, and what the take needs. */
	diskBytesPerSecond: number | null;
	needBytesPerSecond: number;
}

/** Turns measurements into pass/warn/fail rows with plain advice (PF-01). */
export function evaluatePreflight(m: PreflightMeasurements): CheckRow[] {
	const rows: CheckRow[] = [];
	rows.push(
		m.failed.length
			? {
					id: "devices",
					label: "Devices",
					status: "fail",
					detail: m.failed.map((f) => `${f.device}: ${f.reason}`).join("; "),
				}
			: { id: "devices", label: "Devices", status: "ok", detail: "Every device opened" },
	);
	for (const v of m.video) {
		const low = v.height < v.wantHeight * 0.95;
		rows.push({
			id: "resolution",
			label: `${v.device} resolution`,
			status: low ? "warn" : "ok",
			detail: low ? `${v.height}p instead of ${v.wantHeight}p; pick a lower quality or another port` : `${v.height}p`,
		});
		const ratio = v.measuredFps / v.wantFps;
		if (v.onChange) {
			rows.push({
				id: "frame-rate",
				label: `${v.device} frame rate`,
				status: ratio < 0.3 ? "warn" : "ok",
				detail:
					ratio < 0.9
						? `${v.measuredFps.toFixed(0)} fps on a still screen (frames are only sent when something moves)${ratio < 0.3 ? "; close busy apps or choose a lower quality" : ""}`
						: `${v.measuredFps.toFixed(0)} fps`,
			});
			continue;
		}
		rows.push({
			id: "frame-rate",
			label: `${v.device} frame rate`,
			status: ratio < 0.6 ? "fail" : ratio < 0.9 ? "warn" : "ok",
			detail:
				ratio < 0.9
					? `${v.measuredFps.toFixed(0)} of ${v.wantFps} fps. A busy USB port or hub can do this; plug the camera straight into the computer.`
					: `${v.measuredFps.toFixed(0)} fps`,
		});
	}
	if (m.encoderFps !== null) {
		const ratio = m.encoderFps / m.encoderNeedFps;
		rows.push({
			id: "encoder",
			label: "Encoder",
			status: ratio < 1 ? "fail" : ratio < 1.5 ? "warn" : "ok",
			detail:
				ratio < 1
					? `Encodes ${m.encoderFps.toFixed(0)} fps but needs ${m.encoderNeedFps}; choose a lower quality.`
					: ratio < 1.5
						? `Encodes ${m.encoderFps.toFixed(0)} fps, little headroom for ${m.encoderNeedFps}; close other apps.`
						: `Encodes ${m.encoderFps.toFixed(0)} fps (needs ${m.encoderNeedFps})`,
		});
	}
	if (m.diskBytesPerSecond !== null) {
		const ratio = m.diskBytesPerSecond / m.needBytesPerSecond;
		rows.push({
			id: "disk",
			label: "Disk write speed",
			status: ratio < 2 ? "fail" : ratio < 5 ? "warn" : "ok",
			detail: `${formatBytes(m.diskBytesPerSecond)}/s; the take writes ${formatBytes(m.needBytesPerSecond)}/s`,
		});
	}
	return rows;
}
