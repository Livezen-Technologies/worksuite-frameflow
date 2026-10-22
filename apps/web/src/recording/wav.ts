/**
 * WAV encoding for voiceover takes (SRS AR-11): uncompressed 16-bit PCM,
 * written in chunks while recording so a crash loses at most a second or two.
 */

/** Interleaves channels into 16-bit little-endian PCM. */
export function encodePcm16(channels: Float32Array[]): Uint8Array {
	const frames = channels[0]?.length ?? 0;
	const out = new DataView(new ArrayBuffer(frames * channels.length * 2));
	let offset = 0;
	for (let i = 0; i < frames; i++) {
		for (const channel of channels) {
			const sample = Math.max(-1, Math.min(1, channel[i] ?? 0));
			out.setInt16(
				offset,
				sample < 0 ? sample * 0x8000 : sample * 0x7fff,
				true,
			);
			offset += 2;
		}
	}
	return new Uint8Array(out.buffer);
}

export function wavHeader({
	dataBytes,
	sampleRate,
	channelCount,
}: {
	dataBytes: number;
	sampleRate: number;
	channelCount: number;
}): Uint8Array {
	const header = new DataView(new ArrayBuffer(44));
	const ascii = ({ offset, text }: { offset: number; text: string }) => {
		for (let i = 0; i < text.length; i++) {
			header.setUint8(offset + i, text.charCodeAt(i));
		}
	};
	const blockAlign = channelCount * 2;
	ascii({ offset: 0, text: "RIFF" });
	header.setUint32(4, 36 + dataBytes, true);
	ascii({ offset: 8, text: "WAVE" });
	ascii({ offset: 12, text: "fmt " });
	header.setUint32(16, 16, true);
	header.setUint16(20, 1, true);
	header.setUint16(22, channelCount, true);
	header.setUint32(24, sampleRate, true);
	header.setUint32(28, sampleRate * blockAlign, true);
	header.setUint16(32, blockAlign, true);
	header.setUint16(34, 16, true);
	ascii({ offset: 36, text: "data" });
	header.setUint32(40, dataBytes, true);
	return new Uint8Array(header.buffer);
}

/** A WAV file from PCM chunks, dropping `skipFrames` from the start. */
export function buildWav({
	chunks,
	sampleRate,
	channelCount,
	skipFrames = 0,
}: {
	chunks: Uint8Array[];
	sampleRate: number;
	channelCount: number;
	skipFrames?: number;
}): Blob {
	let skipBytes = Math.max(0, Math.round(skipFrames)) * channelCount * 2;
	const parts: Uint8Array[] = [];
	for (const chunk of chunks) {
		if (skipBytes >= chunk.length) {
			skipBytes -= chunk.length;
			continue;
		}
		parts.push(skipBytes > 0 ? chunk.subarray(skipBytes) : chunk);
		skipBytes = 0;
	}
	const dataBytes = parts.reduce((sum, p) => sum + p.length, 0);
	const blobParts: BlobPart[] = [
		wavHeader({ dataBytes, sampleRate, channelCount }),
		...parts,
	].map((p) => new Uint8Array(p));
	return new Blob(blobParts, { type: "audio/wav" });
}

/** Peak level in dBFS of a block, for the meter and clipping warning. */
export function peakDb(samples: Float32Array): number {
	let peak = 0;
	for (const s of samples) peak = Math.max(peak, Math.abs(s));
	return peak <= 0 ? -Infinity : 20 * Math.log10(peak);
}
