/** Deterministic hash → [0, 1) from integers (no global state, so preview == export). */
export function hash01(...values: number[]): number {
	let h = 0x811c9dc5;
	for (const value of values) {
		let v = Math.floor(value) | 0;
		for (let i = 0; i < 4; i++) {
			h ^= v & 0xff;
			h = Math.imul(h, 0x01000193);
			v >>>= 8;
		}
	}
	h ^= h >>> 15;
	h = Math.imul(h, 0x2c1b3c6d);
	h ^= h >>> 12;
	h = Math.imul(h, 0x297a2d39);
	h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
}

/** Seeded shuffle of 0..n-1. */
export function seededPermutation(n: number, seed: number): number[] {
	const out = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(hash01(seed, i, 7919) * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}
