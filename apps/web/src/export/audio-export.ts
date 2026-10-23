import {
	AudioBufferSource,
	BufferTarget,
	canEncodeAudio,
	Mp3OutputFormat,
	Mp4OutputFormat,
	Output,
	WavOutputFormat,
	type AudioCodec,
} from "mediabunny";

/** Audio-only export (SRS EX-12). */
export type AudioExportFormat = "wav" | "mp3" | "m4a";

export const AUDIO_EXPORT_FORMATS: {
	id: AudioExportFormat;
	label: string;
	extension: string;
	mimeType: string;
	codec: AudioCodec;
}[] = [
	{ id: "wav", label: "WAV", extension: ".wav", mimeType: "audio/wav", codec: "pcm-s16" },
	{ id: "mp3", label: "MP3", extension: ".mp3", mimeType: "audio/mpeg", codec: "mp3" },
	{ id: "m4a", label: "M4A (AAC)", extension: ".m4a", mimeType: "audio/mp4", codec: "aac" },
];

export function audioFormatInfo(format: AudioExportFormat) {
	const info = AUDIO_EXPORT_FORMATS.find((f) => f.id === format);
	if (!info) throw new Error(`Unknown audio format ${format}`);
	return info;
}

/** Which formats this machine can encode; WAV always works. */
export async function supportedAudioFormats(): Promise<Set<AudioExportFormat>> {
	const out = new Set<AudioExportFormat>(["wav"]);
	for (const f of AUDIO_EXPORT_FORMATS) {
		if (f.id === "wav") continue;
		try {
			if (await canEncodeAudio(f.codec)) out.add(f.id);
		} catch {
			// Not available here.
		}
	}
	return out;
}

/** Encodes a mixed timeline into the chosen audio file. */
export async function encodeAudioFile({
	buffer,
	format,
	bitrate = 192_000,
}: {
	buffer: AudioBuffer;
	format: AudioExportFormat;
	bitrate?: number;
}): Promise<ArrayBuffer> {
	const info = audioFormatInfo(format);
	const output = new Output({
		format:
			format === "wav"
				? new WavOutputFormat()
				: format === "mp3"
					? new Mp3OutputFormat()
					: new Mp4OutputFormat(),
		target: new BufferTarget(),
	});
	const source = new AudioBufferSource(
		format === "wav" ? { codec: info.codec } : { codec: info.codec, bitrate },
	);
	output.addAudioTrack(source);
	await output.start();
	await source.add(buffer);
	source.close();
	await output.finalize();
	const result = output.target.buffer;
	if (!result) throw new Error("The audio file came out empty.");
	return result;
}
