/**
 * Audio sync (SC-25): every angle's sound is reduced to an onset envelope
 * (how much louder each 10 ms is than the one before), and envelopes are
 * lined up by FFT cross-correlation. Claps, speech and music all give
 * sharp onsets, so this works without a slate.
 */
export const ENVELOPE_RATE = 100;

export function onsetEnvelope({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): Float32Array {
	const hop = Math.max(1, Math.round(sampleRate / ENVELOPE_RATE));
	const frames = Math.floor(samples.length / hop);
	const energy = new Float32Array(frames);
	for (let f = 0; f < frames; f++) {
		let sum = 0;
		for (let i = f * hop; i < (f + 1) * hop; i++)
			sum += samples[i] * samples[i];
		energy[f] = Math.log1p(1000 * Math.sqrt(sum / hop));
	}
	const onset = new Float32Array(frames);
	for (let f = 1; f < frames; f++)
		onset[f] = Math.max(0, energy[f] - energy[f - 1]);
	// Zero mean so silence doesn't correlate with everything.
	let mean = 0;
	for (const v of onset) mean += v;
	mean /= Math.max(1, frames);
	for (let f = 0; f < frames; f++) onset[f] -= mean;
	return onset;
}

export function fft({
	re,
	im,
	inverse,
}: {
	re: Float64Array;
	im: Float64Array;
	inverse: boolean;
}) {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = ((inverse ? 2 : -2) * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
				const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
				re[i + k + len / 2] = re[i + k] - ar;
				im[i + k + len / 2] = im[i + k] - ai;
				re[i + k] += ar;
				im[i + k] += ai;
				const t = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = t;
			}
		}
	}
	if (inverse)
		for (let i = 0; i < n; i++) {
			re[i] /= n;
			im[i] /= n;
		}
}

/**
 * Seconds `other` starts after `reference` (negative: before), with a
 * 0–1 confidence: the peak's height over the next-best peak.
 */
export function findOffset({
	reference,
	other,
	maxLagSeconds = 600,
}: {
	reference: Float32Array;
	other: Float32Array;
	maxLagSeconds?: number;
}): { offset: number; confidence: number } {
	const size = 1 << Math.ceil(Math.log2(reference.length + other.length));
	const ar = new Float64Array(size);
	const ai = new Float64Array(size);
	const br = new Float64Array(size);
	const bi = new Float64Array(size);
	ar.set(reference);
	br.set(other);
	fft({ re: ar, im: ai, inverse: false });
	fft({ re: br, im: bi, inverse: false });
	// reference ⋆ other: A · conj(B)
	for (let i = 0; i < size; i++) {
		const r = ar[i] * br[i] + ai[i] * bi[i];
		const m = ai[i] * br[i] - ar[i] * bi[i];
		ar[i] = r;
		ai[i] = m;
	}
	fft({ re: ar, im: ai, inverse: true });
	const maxLag = Math.min(size / 2, Math.round(maxLagSeconds * ENVELOPE_RATE));
	let best = -Infinity;
	let bestLag = 0;
	let second = -Infinity;
	for (let lag = -maxLag; lag <= maxLag; lag++) {
		const v = ar[(lag + size) % size];
		if (v > best) {
			if (Math.abs(lag - bestLag) > ENVELOPE_RATE) second = best;
			best = v;
			bestLag = lag;
		} else if (v > second && Math.abs(lag - bestLag) > ENVELOPE_RATE)
			second = v;
	}
	// Positive lag: the event happens `lag` frames later in reference, so other started later.
	return {
		offset: bestLag / ENVELOPE_RATE,
		confidence:
			best > 0 ? Math.max(0, Math.min(1, 1 - Math.max(0, second) / best)) : 0,
	};
}

/** Line every angle up against the first; earliest angle starts at 0. */
export function offsetsFromEnvelopes({
	envelopes,
}: {
	envelopes: Float32Array[];
}): {
	offsets: number[];
	confidence: number[];
} {
	const raw = envelopes.map((env, i) =>
		i === 0
			? { offset: 0, confidence: 1 }
			: findOffset({ reference: envelopes[0], other: env }),
	);
	const min = Math.min(...raw.map((r) => r.offset));
	return {
		offsets: raw.map((r) => r.offset - min),
		confidence: raw.map((r) => r.confidence),
	};
}
