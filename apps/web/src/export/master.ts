/** Desktop bridge to production exports through FFmpeg (SRS EX-15). */
export type MasterCodec = "prores" | "ffv1";

export interface MasterExportBridge {
	codecs: () => Promise<MasterCodec[]>;
	start: (args: {
		width: number;
		height: number;
		fps: number;
		codec: MasterCodec;
		audioWav?: ArrayBuffer;
	}) => Promise<{ id: string; ext: string }>;
	frame: (args: { id: string; data: ArrayBuffer }) => Promise<boolean>;
	finish: (args: { id: string }) => Promise<{ size: number }>;
	cancel: (args: { id: string }) => Promise<void>;
	save: (args: {
		id: string;
		suggestedName: string;
		toFolder?: boolean;
	}) => Promise<{ saved: boolean; path?: string }>;
	encodeAudio: (args: {
		data: ArrayBuffer;
		format: "mp3" | "m4a";
	}) => Promise<ArrayBuffer>;
}

export const MASTER_CODECS: {
	id: MasterCodec;
	label: string;
	container: "mov" | "mkv";
	detail: string;
	/** Rough bits per pixel per frame, for the size estimate. */
	bitsPerPixel: number;
}[] = [
	{
		id: "prores",
		label: "ProRes 422 HQ",
		container: "mov",
		detail: "10-bit 4:2:2 .mov for finishing and other editors",
		bitsPerPixel: 1.8,
	},
	{
		id: "ffv1",
		label: "FFV1 lossless",
		container: "mkv",
		detail: "10-bit 4:4:4 lossless .mkv for archiving",
		bitsPerPixel: 6,
	},
];

export function masterBridge(): MasterExportBridge | null {
	return typeof window !== "undefined" ? (window.worksuite?.master ?? null) : null;
}

/** Encodes an AudioBuffer as 16-bit WAV bytes (to hand to FFmpeg). */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
	const channels = buffer.numberOfChannels;
	const frames = buffer.length;
	const data = new DataView(new ArrayBuffer(44 + frames * channels * 2));
	const text = ({ offset, s }: { offset: number; s: string }) => {
		for (let i = 0; i < s.length; i++) data.setUint8(offset + i, s.charCodeAt(i));
	};
	text({ offset: 0, s: "RIFF" });
	data.setUint32(4, 36 + frames * channels * 2, true);
	text({ offset: 8, s: "WAVE" });
	text({ offset: 12, s: "fmt " });
	data.setUint32(16, 16, true);
	data.setUint16(20, 1, true);
	data.setUint16(22, channels, true);
	data.setUint32(24, buffer.sampleRate, true);
	data.setUint32(28, buffer.sampleRate * channels * 2, true);
	data.setUint16(32, channels * 2, true);
	data.setUint16(34, 16, true);
	text({ offset: 36, s: "data" });
	data.setUint32(40, frames * channels * 2, true);
	const planes = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
	let offset = 44;
	for (let i = 0; i < frames; i++)
		for (const plane of planes) {
			const s = Math.max(-1, Math.min(1, plane[i] ?? 0));
			data.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			offset += 2;
		}
	return data.buffer;
}
