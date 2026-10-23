/**
 * HDR export presets (SRS HD-15): 10-bit VP9 in WebM with HLG or PQ,
 * at the bitrates YouTube recommends for HDR uploads.
 */
export interface HdrExportPreset {
	id: string;
	label: string;
	width: number;
	height: number;
	/** Megabits per second. */
	bitrate: number;
}

export const HDR_EXPORT_PRESETS: HdrExportPreset[] = [
	{
		id: "hdr-youtube-4k",
		label: "YouTube HDR 4K",
		width: 3840,
		height: 2160,
		bitrate: 50,
	},
	{
		id: "hdr-youtube-1080",
		label: "YouTube HDR 1080p",
		width: 1920,
		height: 1080,
		bitrate: 12,
	},
	{
		id: "hdr-vertical",
		label: "Reels / Shorts HDR",
		width: 1080,
		height: 1920,
		bitrate: 12,
	},
];

export const isHdrPreset = (id: string) =>
	HDR_EXPORT_PRESETS.some((p) => p.id === id);
