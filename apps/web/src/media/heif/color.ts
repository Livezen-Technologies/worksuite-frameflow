/**
 * Display P3 → sRGB for decoded photos (SRS HE-03). Both use the sRGB
 * curve; the primaries differ, so colours go through linear light and a
 * 3×3 matrix, and anything outside sRGB is clipped.
 */
const P3_TO_SRGB = [
	1.2249401, -0.2249404, 0.0,
	-0.0420569, 1.0420571, 0.0,
	-0.0196376, -0.0786361, 1.0982735,
];

const toLinear = Float32Array.from({ length: 256 }, (_, i) => {
	const c = i / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const STEPS = 4096;
const toEncoded = Uint8ClampedArray.from({ length: STEPS + 1 }, (_, i) => {
	const c = i / STEPS;
	const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
	return Math.round(v * 255);
});

const encode = (linear: number) =>
	toEncoded[Math.round(Math.min(1, Math.max(0, linear)) * STEPS)];

/** Converts RGBA pixels in place. */
export function p3ToSrgb(data: Uint8ClampedArray): void {
	const m = P3_TO_SRGB;
	for (let i = 0; i < data.length; i += 4) {
		const r = toLinear[data[i]];
		const g = toLinear[data[i + 1]];
		const b = toLinear[data[i + 2]];
		data[i] = encode(m[0] * r + m[1] * g + m[2] * b);
		data[i + 1] = encode(m[3] * r + m[4] * g + m[5] * b);
		data[i + 2] = encode(m[6] * r + m[7] * g + m[8] * b);
	}
}
