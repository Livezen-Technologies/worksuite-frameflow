import type { CaptionCue } from "./caption-files";
import type { FrameRate } from "opencut-wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];

/** H.264, HEVC and AV1 go in MP4; VP9 in WebM (SRS ED-09). */
export const EXPORT_CODEC_VALUES = ["avc", "hevc", "av1", "vp9"] as const;
export type ExportCodec = (typeof EXPORT_CODEC_VALUES)[number];

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	fps?: FrameRate;
	includeAudio?: boolean;
	/** Video codec; defaults to H.264 for MP4 and VP9 for WebM. */
	codec?: ExportCodec;
	/** Output size; the project frame is scaled to fit, letterboxed if needed. */
	resolution?: { width: number; height: number };
	/** Draw caption clips into the picture (default true). */
	burnInCaptions?: boolean;
	/** Add the captions as a subtitle track inside the file. */
	embedCaptions?: boolean;
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	/** Captions on the timeline, for writing .srt files beside the video. */
	captions?: CaptionCue[];
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);
}
