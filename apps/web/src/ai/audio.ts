/** 16-bit mono WAV, the smallest lossless format Gemini takes inline. */
export function encodeWav({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): ArrayBuffer {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const ascii = ({ offset, text }: { offset: number; text: string }) => {
		for (let i = 0; i < text.length; i++)
			view.setUint8(offset + i, text.charCodeAt(i));
	};
	ascii({ offset: 0, text: "RIFF" });
	view.setUint32(4, 36 + samples.length * 2, true);
	ascii({ offset: 8, text: "WAVE" });
	ascii({ offset: 12, text: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	ascii({ offset: 36, text: "data" });
	view.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const v = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
	}
	return buffer;
}

/**
 * Split audio into chunks of about `seconds`, cutting at the quietest
 * 50 ms in the last 10 s of each chunk so words aren't cut in half.
 */
export function splitAtPauses({
	samples,
	sampleRate,
	seconds = 240,
}: {
	samples: Float32Array;
	sampleRate: number;
	seconds?: number;
}): { start: number; end: number }[] {
	const target = Math.floor(seconds * sampleRate);
	const window = Math.floor(0.05 * sampleRate);
	const search = Math.floor(10 * sampleRate);
	const chunks: { start: number; end: number }[] = [];
	let start = 0;
	while (samples.length - start > target) {
		let best = start + target;
		let bestEnergy = Infinity;
		for (
			let at = start + target - search;
			at + window <= start + target;
			at += window
		) {
			let energy = 0;
			for (let i = at; i < at + window; i++) energy += samples[i] * samples[i];
			if (energy < bestEnergy) {
				bestEnergy = energy;
				best = at + Math.floor(window / 2);
			}
		}
		chunks.push({ start, end: best });
		start = best;
	}
	chunks.push({ start, end: samples.length });
	return chunks.filter((c) => c.end > c.start);
}
