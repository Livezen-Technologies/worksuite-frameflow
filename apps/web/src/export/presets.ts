import type { ExportCodec, ExportQuality } from "./index";

export interface ExportPreset {
	id: string;
	label: string;
	width: number;
	height: number;
}

/** The Export screen's presets. */
export const EXPORT_PRESETS: ExportPreset[] = [
	{ id: "youtube-1080", label: "YouTube 1080p", width: 1920, height: 1080 },
	{ id: "vertical", label: "TikTok / Reels", width: 1080, height: 1920 },
	{ id: "4k", label: "4K master", width: 3840, height: 2160 },
];

export const EXPORT_CODEC_LABELS: Record<ExportCodec, string> = {
	avc: "H.264",
	hevc: "HEVC",
	av1: "AV1",
	vp9: "VP9",
};

export function formatForCodec(codec: ExportCodec): "mp4" | "webm" {
	return codec === "vp9" ? "webm" : "mp4";
}

/** Bits per pixel per frame for H.264; newer codecs need less for the same look. */
const BITS_PER_PIXEL: Record<ExportQuality, number> = {
	low: 0.04,
	medium: 0.07,
	high: 0.1,
	very_high: 0.16,
};
const CODEC_EFFICIENCY: Record<ExportCodec, number> = {
	avc: 1,
	vp9: 0.7,
	hevc: 0.6,
	av1: 0.5,
};

/** A rough file size in bytes, shown before export. */
export function estimateExportBytes({
	width,
	height,
	fps,
	seconds,
	quality,
	codec,
	includeAudio,
}: {
	width: number;
	height: number;
	fps: number;
	seconds: number;
	quality: ExportQuality;
	codec: ExportCodec;
	includeAudio: boolean;
}): number {
	// Higher frame rates compress better per frame.
	const fpsFactor = (fps / 30) ** 0.75 * 30;
	const videoBps =
		width *
		height *
		fpsFactor *
		BITS_PER_PIXEL[quality] *
		CODEC_EFFICIENCY[codec];
	const audioBps = includeAudio ? 192_000 : 0;
	return ((videoBps + audioBps) * seconds) / 8;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** Where the project frame lands inside the output, keeping its shape. */
export function fitRect({
	source,
	target,
}: {
	source: { width: number; height: number };
	target: { width: number; height: number };
}): { x: number; y: number; width: number; height: number } {
	const scale = Math.min(
		target.width / source.width,
		target.height / source.height,
	);
	const width = Math.round(source.width * scale);
	const height = Math.round(source.height * scale);
	return {
		x: Math.round((target.width - width) / 2),
		y: Math.round((target.height - height) / 2),
		width,
		height,
	};
}

/** Encoders need even dimensions. */
export function evenSize({ width, height }: { width: number; height: number }) {
	return {
		width: Math.max(2, Math.round(width / 2) * 2),
		height: Math.max(2, Math.round(height / 2) * 2),
	};
}
