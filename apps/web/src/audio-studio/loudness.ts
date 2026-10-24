/**
 * Loudness to ITU-R BS.1770-4 / EBU R128 (AE-07): integrated loudness
 * (LUFS, gated), true peak (dBTP, 4× oversampled) and loudness range (LU).
 */

export interface LoudnessReport {
	integrated: number;
	truePeak: number;
	range: number;
	/** Loudest 3 s window (short-term max). */
	shortTermMax: number;
}

interface Biquad {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

/** The two K-weighting stages, worked out for any sample rate. */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
	// Stage 1: high shelf (head effect).
	let f0 = 1681.974450955533;
	const G = 3.999843853973347;
	let Q = 0.7071752369554196;
	let K = Math.tan((Math.PI * f0) / sampleRate);
	const Vh = 10 ** (G / 20);
	const Vb = Vh ** 0.4996667741545416;
	let a0 = 1 + K / Q + K * K;
	const shelf: Biquad = {
		b0: (Vh + (Vb * K) / Q + K * K) / a0,
		b1: (2 * (K * K - Vh)) / a0,
		b2: (Vh - (Vb * K) / Q + K * K) / a0,
		a1: (2 * (K * K - 1)) / a0,
		a2: (1 - K / Q + K * K) / a0,
	};
	// Stage 2: high pass (RLB).
	f0 = 38.13547087602444;
	Q = 0.5003270373238773;
	K = Math.tan((Math.PI * f0) / sampleRate);
	a0 = 1 + K / Q + K * K;
	const highpass: Biquad = {
		b0: 1 / a0,
		b1: -2 / a0,
		b2: 1 / a0,
		a1: (2 * (K * K - 1)) / a0,
		a2: (1 - K / Q + K * K) / a0,
	};
	return [shelf, highpass];
}

function filter({ input, f }: { input: Float32Array; f: Biquad }): Float32Array {
	const out = new Float32Array(input.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < input.length; i++) {
		const x = input[i]!;
		const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		out[i] = y;
	}
	return out;
}

const lufs = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity);

/** Mean power of each window (summed over channels, all weights 1 for L/R/C). */
function windowPowers({ weighted, sampleRate, seconds, step }: { weighted: Float32Array[]; sampleRate: number; seconds: number; step: number }): number[] {
	const size = Math.round(seconds * sampleRate);
	const hop = Math.round(step * sampleRate);
	const length = weighted[0]?.length ?? 0;
	const out: number[] = [];
	// Running sums of squares make every window O(1).
	const prefix = weighted.map((ch) => {
		const p = new Float64Array(ch.length + 1);
		for (let i = 0; i < ch.length; i++) p[i + 1] = p[i]! + ch[i]! * ch[i]!;
		return p;
	});
	for (let start = 0; start + size <= length; start += hop) {
		let sum = 0;
		for (const p of prefix) sum += (p[start + size]! - p[start]!) / size;
		out.push(sum);
	}
	return out;
}

function gatedLoudness(powers: number[]): number {
	const above = powers.filter((p) => lufs(p) > -70);
	if (!above.length) return -Infinity;
	const relative = lufs(above.reduce((a, b) => a + b, 0) / above.length) - 10;
	const gated = above.filter((p) => lufs(p) > relative);
	return gated.length ? lufs(gated.reduce((a, b) => a + b, 0) / gated.length) : -Infinity;
}

/** 4× oversampled peak with a windowed-sinc interpolator (BS.1770 Annex 2). */
export function truePeak(channels: Float32Array[]): number {
	const taps = 12;
	const phases = [0.25, 0.5, 0.75].map((frac) => {
		const k: number[] = [];
		for (let n = -taps + 1; n <= taps; n++) {
			const t = n - frac;
			const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
			const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / taps);
			k.push(sinc * w);
		}
		return k;
	});
	let peak = 0;
	for (const ch of channels) {
		for (let i = 0; i < ch.length; i++) {
			const v = Math.abs(ch[i]!);
			if (v > peak) peak = v;
		}
		for (let i = taps; i < ch.length - taps; i++) {
			// Only look between samples where a peak could hide.
			if (Math.abs(ch[i]!) < peak * 0.7 && Math.abs(ch[i + 1]!) < peak * 0.7) continue;
			for (const k of phases) {
				let s = 0;
				for (let j = 0; j < k.length; j++) s += ch[i + j - taps + 1]! * k[j]!;
				const v = Math.abs(s);
				if (v > peak) peak = v;
			}
		}
	}
	return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

export function measureLoudness({ channels, sampleRate }: { channels: Float32Array[]; sampleRate: number }): LoudnessReport {
	const [shelf, hp] = kWeighting(sampleRate);
	const weighted = channels.slice(0, 2).map((ch) => filter({ input: filter({ input: ch, f: shelf }), f: hp }));
	const integrated = gatedLoudness(windowPowers({ weighted, sampleRate, seconds: 0.4, step: 0.1 }));
	// Loudness range: 10th to 95th percentile of gated 3 s windows (EBU Tech 3342).
	const short = windowPowers({ weighted, sampleRate, seconds: 3, step: 1 });
	const shortAbove = short.filter((p) => lufs(p) > -70);
	let range = 0;
	let shortTermMax = -Infinity;
	if (shortAbove.length) {
		const rel = lufs(shortAbove.reduce((a, b) => a + b, 0) / shortAbove.length) - 20;
		const levels = shortAbove.map(lufs).filter((l) => l > rel).sort((a, b) => a - b);
		const at = (q: number) => levels[Math.min(levels.length - 1, Math.round(q * (levels.length - 1)))]!;
		if (levels.length) range = at(0.95) - at(0.1);
		shortTermMax = Math.max(...short.map(lufs));
	}
	return { integrated, truePeak: truePeak(channels), range, shortTermMax };
}

export function measureBuffer(buffer: AudioBuffer): LoudnessReport {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
	return measureLoudness({ channels, sampleRate: buffer.sampleRate });
}

/** Export targets (AE-09). */
export const LOUDNESS_TARGETS = [
	{ id: "podcast", label: "Podcast", lufs: -16, peak: -1, format: "mp3", channels: 2, note: "MP3 · −16 LUFS" },
	{ id: "youtube", label: "YouTube", lufs: -14, peak: -1, format: "m4a", channels: 2, note: "AAC · −14 LUFS" },
	{ id: "broadcast", label: "Broadcast", lufs: -23, peak: -1, format: "wav", channels: 2, note: "WAV · −23 LUFS (EBU R128)" },
	{ id: "audiobook", label: "Audiobook", lufs: -19, peak: -3, format: "mp3", channels: 1, note: "MP3 mono · −19 LUFS" },
	{ id: "music", label: "Music master", lufs: -9, peak: -1, format: "wav", channels: 2, note: "WAV · −9 LUFS" },
] as const;

export const formatLufs = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "−∞");
