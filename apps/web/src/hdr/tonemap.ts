/**
 * HDR → SDR conversion (SRS HD-03, HD-07, HD-08, HD-17). Decoded HLG and
 * PQ frames are turned into display light, placed so HDR reference white
 * (203 nits, BT.2408) lands on SDR white, highlights above it are rolled
 * off smoothly instead of clipped, then the BT.2020 colours are mapped to
 * BT.709 and encoded for an sRGB canvas. The GLSL in tonemap-gl.ts does the
 * same per pixel; these functions are the reference it is tested against.
 */

export type Transfer = "sdr" | "hlg" | "pq";

export interface ToneMapSettings {
	/** 0 = hard knee near white, 1 = long, gentle highlight roll-off. */
	rolloff: number;
	/** Colour amount after mapping; 1 keeps it. */
	saturation: number;
	/** Exposure in stops before mapping. */
	exposure: number;
}

export const DEFAULT_TONE_MAP: ToneMapSettings = {
	rolloff: 0.5,
	saturation: 1,
	exposure: 0,
};

/** Graphics/reference white for HDR (BT.2408). */
export const REFERENCE_WHITE_NITS = 203;
const HLG_PEAK_NITS = 1000;

// PQ (SMPTE ST 2084) constants.
const M1 = 2610 / 16384;
const M2 = (2523 / 4096) * 128;
const C1 = 3424 / 4096;
const C2 = (2413 / 4096) * 32;
const C3 = (2392 / 4096) * 32;

/** PQ signal (0..1) to display light in nits. */
export function pqToNits(signal: number): number {
	const p = Math.max(signal, 0) ** (1 / M2);
	return 10000 * (Math.max(p - C1, 0) / (C2 - C3 * p)) ** (1 / M1);
}

const HLG_A = 0.17883277;
const HLG_B = 1 - 4 * HLG_A;
const HLG_C = 0.5 - HLG_A * Math.log(4 * HLG_A);

/** HLG signal (0..1) to normalised scene light (inverse OETF, BT.2100). */
export function hlgToScene(signal: number): number {
	const e = Math.max(signal, 0);
	return e <= 0.5 ? (e * e) / 3 : (Math.exp((e - HLG_C) / HLG_A) + HLG_B) / 12;
}

/** BT.2020 luminance weights. */
export const LUMA_2020 = [0.2627, 0.678, 0.0593] as const;

/**
 * HLG OOTF for a 1,000-nit display (system gamma 1.2): scene RGB to
 * display nits.
 */
export function hlgOotf(
	rgb: [number, number, number],
): [number, number, number] {
	const ys =
		LUMA_2020[0] * rgb[0] + LUMA_2020[1] * rgb[1] + LUMA_2020[2] * rgb[2];
	const gain = HLG_PEAK_NITS * Math.max(ys, 1e-6) ** (1.2 - 1);
	return [rgb[0] * gain, rgb[1] * gain, rgb[2] * gain];
}

/**
 * Highlight roll-off on relative luminance (1 = reference white). Below
 * the knee it is linear; above, an exponential shoulder approaches 1
 * without clipping, so bright skies keep detail.
 */
export function rolloffCurve({
	x,
	rolloff,
}: {
	x: number;
	rolloff: number;
}): number {
	const knee = 1 - 0.6 * Math.min(Math.max(rolloff, 0), 1) - 0.15;
	if (x <= knee) return x;
	const span = 1 - knee;
	return knee + span * (1 - Math.exp(-(x - knee) / span));
}

/** Linear BT.2020 to linear BT.709 (BT.2087). */
const BT2020_TO_709 = [
	[1.6605, -0.5876, -0.0728],
	[-0.1246, 1.1329, -0.0083],
	[-0.0182, -0.1006, 1.1187],
] as const;

export function srgbEncode(linear: number): number {
	const v = Math.min(Math.max(linear, 0), 1);
	return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/**
 * One pixel: non-linear BT.2020 R'G'B' (0..1) in the given transfer to
 * sRGB-encoded BT.709 (0..1).
 */
export function toneMapPixel({
	rgb,
	transfer,
	settings,
}: {
	rgb: [number, number, number];
	transfer: Transfer;
	settings: ToneMapSettings;
}): [number, number, number] {
	let nits: [number, number, number];
	if (transfer === "pq")
		nits = [pqToNits(rgb[0]), pqToNits(rgb[1]), pqToNits(rgb[2])];
	else if (transfer === "hlg")
		nits = hlgOotf([
			hlgToScene(rgb[0]),
			hlgToScene(rgb[1]),
			hlgToScene(rgb[2]),
		]);
	else
		nits = [
			rgb[0] ** 2.4 * REFERENCE_WHITE_NITS,
			rgb[1] ** 2.4 * REFERENCE_WHITE_NITS,
			rgb[2] ** 2.4 * REFERENCE_WHITE_NITS,
		];
	const gain = 2 ** settings.exposure / REFERENCE_WHITE_NITS;
	const rel: [number, number, number] = [
		nits[0] * gain,
		nits[1] * gain,
		nits[2] * gain,
	];
	const y =
		LUMA_2020[0] * rel[0] + LUMA_2020[1] * rel[1] + LUMA_2020[2] * rel[2];
	const mapped = rolloffCurve({ x: y, rolloff: settings.rolloff });
	const scale = y > 1e-6 ? mapped / y : 0;
	// Bright colours lose some saturation as they roll off, like film.
	const highlight = Math.min(Math.max((y - 1) / 3, 0), 1);
	const sat = settings.saturation * (1 - 0.35 * highlight);
	const tone = (c: number) => mapped + (c * scale - mapped) * sat;
	const toned = [tone(rel[0]), tone(rel[1]), tone(rel[2])];
	const out = BT2020_TO_709.map(
		(row) => row[0] * toned[0] + row[1] * toned[1] + row[2] * toned[2],
	);
	return [srgbEncode(out[0]), srgbEncode(out[1]), srgbEncode(out[2])];
}

export function isHdrTransfer(
	transfer: string | null | undefined,
): transfer is "hlg" | "pq" {
	return transfer === "hlg" || transfer === "pq";
}
