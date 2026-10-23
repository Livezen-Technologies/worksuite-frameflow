import type { MulticamCut, MulticamGroup } from "./types";

/**
 * Smart switching (SC-29): cut to the angle whose audio is loudest (the
 * person speaking into that camera's mic), holding each shot at least
 * `minShot` seconds and switching only for a clear lead.
 */
export function suggestCuts({
	group,
	loudness,
	rate,
	minShot = 2,
	lead = 1.5,
}: {
	group: MulticamGroup;
	/** Per angle, RMS in dB per frame of its own source timeline. */
	loudness: Float32Array[];
	/** Frames per second of `loudness`. */
	rate: number;
	minShot?: number;
	lead?: number;
}): MulticamCut[] {
	const steps = Math.floor(group.length * 2);
	const cuts: MulticamCut[] = [];
	let current = -1;
	let since = 0;
	const level = ({ angle, at }: { angle: number; at: number }) => {
		const a = group.angles[angle];
		const i = Math.floor((at - a.offset) * rate);
		const env = loudness[angle];
		if (!env || i < 0 || i >= env.length) return -Infinity;
		// Average over half a second so single peaks don't decide.
		let sum = 0;
		let n = 0;
		for (let k = i; k < Math.min(env.length, i + rate / 2); k++, n++)
			sum += env[k];
		return n ? sum / n : -Infinity;
	};
	for (let s = 0; s < steps; s++) {
		const at = s / 2;
		const levels = group.angles.map((_, k) => level({ angle: k, at }));
		const loudest = levels.indexOf(Math.max(...levels));
		if (loudest < 0 || levels[loudest] === -Infinity) continue;
		if (current < 0) {
			current = loudest;
			since = at;
			cuts.push({ at: 0, angle: loudest });
			continue;
		}
		const ahead =
			levels[loudest] -
			(levels[current] === -Infinity ? -120 : levels[current]);
		if (loudest !== current && at - since >= minShot && ahead >= lead) {
			current = loudest;
			since = at;
			cuts.push({ at, angle: loudest });
		}
	}
	return cuts.length ? cuts : [{ at: 0, angle: 0 }];
}

/** RMS level in dB per frame, for smart switching. */
export function loudnessEnvelope({
	samples,
	sampleRate,
	rate = 20,
}: {
	samples: Float32Array;
	sampleRate: number;
	rate?: number;
}): Float32Array {
	const hop = Math.max(1, Math.round(sampleRate / rate));
	const out = new Float32Array(Math.floor(samples.length / hop));
	for (let f = 0; f < out.length; f++) {
		let sum = 0;
		for (let i = f * hop; i < (f + 1) * hop; i++)
			sum += samples[i] * samples[i];
		out[f] = 10 * Math.log10(sum / hop + 1e-10);
	}
	return out;
}
