/**
 * Beat detection for Audio › Basic › Beats detection: an energy-flux onset
 * finder. Rises in loudness well above the recent average count as beats,
 * at most one every `minGap` seconds. Good for marking cuts to music.
 */
export function detectBeats({
	samples,
	sampleRate,
	minGap = 0.25,
	sensitivity = 1.5,
}: {
	samples: Float32Array;
	sampleRate: number;
	minGap?: number;
	sensitivity?: number;
}): number[] {
	const hop = 512;
	const frames = Math.floor(samples.length / hop);
	if (frames < 4) return [];
	const energy = new Float32Array(frames);
	for (let f = 0; f < frames; f++) {
		let sum = 0;
		for (let i = f * hop; i < (f + 1) * hop; i++) sum += samples[i]! * samples[i]!;
		energy[f] = Math.sqrt(sum / hop);
	}
	const flux = new Float32Array(frames);
	for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f]! - energy[f - 1]!);
	const window = Math.max(4, Math.round((0.5 * sampleRate) / hop));
	const beats: number[] = [];
	let last = -Infinity;
	for (let f = 1; f < frames - 1; f++) {
		let mean = 0;
		const from = Math.max(0, f - window);
		for (let i = from; i < f; i++) mean += flux[i]!;
		mean /= Math.max(1, f - from);
		const peak = flux[f]! > flux[f - 1]! && flux[f]! >= flux[f + 1]!;
		const t = (f * hop) / sampleRate;
		if (peak && flux[f]! > mean * sensitivity && flux[f]! > 0.01 && t - last >= minGap) {
			beats.push(t);
			last = t;
		}
	}
	return beats;
}
