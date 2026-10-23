import { fft } from "@/multicam/sync";

/**
 * Voice tools for recorded takes (SRS AR-15–AR-17), as plain functions on
 * samples so they're the same in preview and export, and testable.
 */
export const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
export const fromDb = (db: number) => 10 ** (db / 20);

/** RMS level in dB for each window. */
export function frameLevels({
	samples,
	sampleRate,
	window = 0.02,
}: {
	samples: Float32Array;
	sampleRate: number;
	window?: number;
}): Float32Array {
	const size = Math.max(1, Math.round(sampleRate * window));
	const out = new Float32Array(Math.ceil(samples.length / size));
	for (let f = 0; f < out.length; f++) {
		let sum = 0;
		const end = Math.min(samples.length, (f + 1) * size);
		for (let i = f * size; i < end; i++) sum += (samples[i] ?? 0) ** 2;
		out[f] = toDb(Math.sqrt(sum / Math.max(1, end - f * size)));
	}
	return out;
}

/** The quiet level of a take: its 10th-percentile window. */
export function noiseFloor(levels: Float32Array): number {
	const sorted = Float32Array.from(levels).sort();
	return sorted[Math.floor(sorted.length * 0.1)] ?? -90;
}

/** Where someone is speaking, in seconds: above the floor by `margin` dB. */
export function speechRanges({
	samples,
	sampleRate,
	margin = 12,
	minGap = 0.25,
	window = 0.02,
}: {
	samples: Float32Array;
	sampleRate: number;
	margin?: number;
	minGap?: number;
	window?: number;
}): [number, number][] {
	const levels = frameLevels({ samples, sampleRate, window });
	const threshold = Math.max(noiseFloor(levels) + margin, -55);
	const ranges: [number, number][] = [];
	let start: number | null = null;
	for (let f = 0; f <= levels.length; f++) {
		const loud = f < levels.length && (levels[f] ?? -Infinity) > threshold;
		if (loud && start === null) start = f * window;
		if (!loud && start !== null) {
			const end = f * window;
			const last = ranges[ranges.length - 1];
			if (last && start - last[1] < minGap) last[1] = end;
			else ranges.push([start, end]);
			start = null;
		}
	}
	return ranges;
}

/**
 * Silence trim (AR-17): keep speech with a little air around it, drop the
 * start and end silence, and shorten pauses longer than `maxPause` to
 * `keepPause`. Returns the source ranges to keep, in order.
 */
export function silencePlan({
	speech,
	duration,
	pad = 0.15,
	shortenPauses = true,
	maxPause = 1,
	keepPause = 0.4,
}: {
	speech: [number, number][];
	duration: number;
	pad?: number;
	shortenPauses?: boolean;
	maxPause?: number;
	keepPause?: number;
}): [number, number][] {
	if (speech.length === 0) return [];
	const first = speech[0]!;
	const last = speech[speech.length - 1]!;
	if (!shortenPauses)
		return [[Math.max(0, first[0] - pad), Math.min(duration, last[1] + pad)]];
	const keep: [number, number][] = [];
	let start = Math.max(0, first[0] - pad);
	for (let i = 0; i < speech.length - 1; i++) {
		const end = speech[i]![1];
		const next = speech[i + 1]![0];
		if (next - end > maxPause) {
			keep.push([start, end + keepPause / 2]);
			start = next - keepPause / 2;
		}
	}
	keep.push([start, Math.min(duration, last[1] + pad)]);
	return keep;
}

/**
 * Noise reduction by spectral gating (AR-15): learns the noise spectrum
 * from the quietest frames and turns each frequency down where it's no
 * louder than that, with soft edges so speech isn't chopped.
 */
export function spectralGate({
	samples,
	sampleRate,
	reductionDb = 14,
}: {
	samples: Float32Array;
	sampleRate: number;
	reductionDb?: number;
}): Float32Array {
	const size = 1024;
	const hop = 256;
	const bins = size / 2 + 1;
	const win = new Float64Array(size).map(
		(_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
	);
	const frames = Math.max(1, Math.ceil((samples.length - size) / hop) + 1);
	const mags: Float64Array[] = [];
	const spectra: { re: Float64Array; im: Float64Array }[] = [];
	const energies = new Float64Array(frames);
	for (let f = 0; f < frames; f++) {
		const re = new Float64Array(size);
		const im = new Float64Array(size);
		for (let i = 0; i < size; i++)
			re[i] = (samples[f * hop + i] ?? 0) * (win[i] ?? 0);
		fft({ re, im, inverse: false });
		const mag = new Float64Array(bins);
		let e = 0;
		for (let k = 0; k < bins; k++) {
			mag[k] = Math.hypot(re[k] ?? 0, im[k] ?? 0);
			e += (mag[k] ?? 0) ** 2;
		}
		mags.push(mag);
		spectra.push({ re, im });
		energies[f] = e;
	}
	// Noise profile: mean spectrum of the quietest 15% of frames.
	const order = Array.from(energies.keys()).sort(
		(a, b) => (energies[a] ?? 0) - (energies[b] ?? 0),
	);
	const quiet = order.slice(0, Math.max(1, Math.floor(frames * 0.15)));
	const profile = new Float64Array(bins);
	for (const f of quiet)
		for (let k = 0; k < bins; k++)
			profile[k]! += (mags[f]?.[k] ?? 0) / quiet.length;
	const floor = fromDb(-reductionDb);
	const out = new Float32Array(samples.length);
	const norm = new Float32Array(samples.length);
	let prevGain = new Float64Array(bins).fill(1);
	for (let f = 0; f < frames; f++) {
		const { re, im } = spectra[f]!;
		const mag = mags[f]!;
		const gain = new Float64Array(bins);
		for (let k = 0; k < bins; k++) {
			// Soft mask: 1 well above the noise, `floor` at or below it.
			const snr = (mag[k] ?? 0) / ((profile[k] ?? 0) * 2 + 1e-12);
			const g = Math.min(1, Math.max(floor, (snr - 1) / 1.5 + floor));
			// Smooth over time so it doesn't warble.
			gain[k] = 0.6 * g + 0.4 * (prevGain[k] ?? 1);
		}
		prevGain = gain;
		for (let k = 0; k < bins; k++) {
			re[k]! *= gain[k] ?? 1;
			im[k]! *= gain[k] ?? 1;
			if (k > 0 && k < size / 2) {
				re[size - k]! *= gain[k] ?? 1;
				im[size - k]! *= gain[k] ?? 1;
			}
		}
		fft({ re, im, inverse: true });
		for (let i = 0; i < size; i++) {
			const at = f * hop + i;
			if (at >= samples.length) break;
			out[at]! += (re[i] ?? 0) * (win[i] ?? 0);
			norm[at]! += (win[i] ?? 0) ** 2;
		}
	}
	for (let i = 0; i < out.length; i++)
		if ((norm[i] ?? 0) > 1e-6) out[i]! /= norm[i]!;
	return out;
}

/** Loudness of speech in LUFS-like dB: RMS of the frames above the floor. */
export function speechLoudness({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): number {
	const levels = frameLevels({ samples, sampleRate, window: 0.4 });
	const gate = Math.max(noiseFloor(levels) + 10, -70);
	let sum = 0;
	let n = 0;
	for (const l of levels)
		if (l > gate) {
			sum += fromDb(l) ** 2;
			n++;
		}
	return n ? toDb(Math.sqrt(sum / n)) - 0.691 : -90;
}

/** Gain to reach `target` loudness without the peak going over `ceiling` dB. */
export function levellingGain({
	samples,
	sampleRate,
	target = -16,
	ceiling = -1,
}: {
	samples: Float32Array;
	sampleRate: number;
	target?: number;
	ceiling?: number;
}): number {
	let peak = 0;
	for (const s of samples) peak = Math.max(peak, Math.abs(s));
	const wanted = target - speechLoudness({ samples, sampleRate });
	// A limiter after this catches short peaks; never push quiet takes past +20 dB.
	return Math.min(wanted, 20, ceiling - toDb(peak) + 6);
}

/**
 * Auto-duck (AR-16): volume keys (dB, timeline seconds) that lower music
 * by `depth` while someone speaks, with `fade`-second ramps.
 */
export function duckKeys({
	speech,
	depth = -12,
	fade = 0.3,
	hold = 0.4,
}: {
	speech: [number, number][];
	depth?: number;
	fade?: number;
	hold?: number;
}): { time: number; db: number }[] {
	// Join speech closer than a fade apart so the music doesn't pump.
	const joined: [number, number][] = [];
	for (const [s, e] of speech) {
		const last = joined[joined.length - 1];
		if (last && s - last[1] < fade * 2 + hold) last[1] = Math.max(last[1], e);
		else joined.push([s, e]);
	}
	const keys: { time: number; db: number }[] = [];
	for (const [s, e] of joined) {
		const down = Math.max(0, s - fade);
		keys.push(
			{ time: down, db: 0 },
			{ time: s, db: depth },
			{ time: e + hold, db: depth },
			{ time: e + hold + fade, db: 0 },
		);
	}
	return keys;
}
