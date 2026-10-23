import { nitsToPq } from "./encode";
import { hlgToScene, LUMA_2020 } from "./tonemap";

/**
 * Light levels of the HDR working signal (8-bit HLG RGBA from the
 * compositor) on a 1,000-nit display: per-pixel nits for scopes and false
 * colour (SRS HD-10), and MaxCLL / MaxFALL for HDR10 metadata (HD-14).
 */

const SCENE = Float32Array.from({ length: 256 }, (_, i) => hlgToScene(i / 255));
export const HLG_DISPLAY_PEAK = 1000;

/** Display nits of one HLG pixel, per channel. */
export function hlgPixelNits({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}): [number, number, number] {
	const sr = SCENE[r];
	const sg = SCENE[g];
	const sb = SCENE[b];
	const ys = Math.max(
		LUMA_2020[0] * sr + LUMA_2020[1] * sg + LUMA_2020[2] * sb,
		1e-6,
	);
	const gain = HLG_DISPLAY_PEAK * ys ** 0.2;
	return [sr * gain, sg * gain, sb * gain];
}

/** Brightest pixel and average frame light, both as max(R,G,B) in nits (CTA-861.3). */
export function frameLightLevel({ rgba }: { rgba: Uint8ClampedArray }): {
	maxCll: number;
	fall: number;
} {
	let max = 0;
	let sum = 0;
	const pixels = rgba.length / 4;
	for (let i = 0; i < rgba.length; i += 4) {
		const [r, g, b] = hlgPixelNits({
			r: rgba[i],
			g: rgba[i + 1],
			b: rgba[i + 2],
		});
		const m = Math.max(r, g, b);
		if (m > max) max = m;
		sum += m;
	}
	return { maxCll: max, fall: pixels ? sum / pixels : 0 };
}

/** Running MaxCLL / MaxFALL over an export. */
export class LightLevelMeter {
	private maxCll = 0;
	private maxFall = 0;
	add({ rgba }: { rgba: Uint8ClampedArray }) {
		const { maxCll, fall } = frameLightLevel({ rgba });
		this.maxCll = Math.max(this.maxCll, maxCll);
		this.maxFall = Math.max(this.maxFall, fall);
	}
	result(): { maxCll: number; maxFall: number } {
		return {
			maxCll: Math.round(this.maxCll),
			maxFall: Math.round(this.maxFall),
		};
	}
}

/** Scope guide lines (HD-10), as PQ signal heights. */
export const NITS_GUIDES = [100, 203, 1000, 10000].map((nits) => ({
	nits,
	level: nitsToPq(nits),
}));

/** Waveform of pixel luminance on a PQ axis (0–10,000 nits), 256 bins per column. */
export function nitsWaveform({
	data,
	width,
	height,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}): Uint32Array {
	const counts = new Uint32Array(width * 256);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const [r, g, b] = hlgPixelNits({
				r: data[i],
				g: data[i + 1],
				b: data[i + 2],
			});
			const nits = LUMA_2020[0] * r + LUMA_2020[1] * g + LUMA_2020[2] * b;
			counts[x * 256 + Math.min(255, Math.round(nitsToPq(nits) * 255))]++;
		}
	return counts;
}

// BT.2020 → BT.709 (linear light).
const TO_709 = [
	[1.6605, -0.5876, -0.0728],
	[-0.1246, 1.1329, -0.0083],
	[-0.0182, -0.1006, 1.1187],
];

export type FalseColour = "over" | "highlight" | "gamut" | "normal";

/** Over 1,000 nits (beyond the reference display), above graphics white, or outside Rec. 709. */
export function classifyPixel({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}): FalseColour {
	const nits = hlgPixelNits({ r, g, b });
	const peak = Math.max(...nits);
	if (peak > HLG_DISPLAY_PEAK * 0.98) return "over";
	const lin = nits.map((n) => n / HLG_DISPLAY_PEAK);
	const in709 = TO_709.map(
		(row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2],
	);
	if (Math.min(...in709) < -0.002) return "gamut";
	if (peak > 203 * 1.05) return "highlight";
	return "normal";
}

const PAINT: Record<FalseColour, [number, number, number] | null> = {
	over: [255, 40, 40],
	gamut: [230, 60, 230],
	highlight: [255, 210, 40],
	normal: null,
};

/** A false-colour picture: warnings painted, everything else in grey. */
export function falseColour({
	data,
}: {
	data: Uint8ClampedArray;
}): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(data.length);
	for (let i = 0; i < data.length; i += 4) {
		const kind = classifyPixel({ r: data[i], g: data[i + 1], b: data[i + 2] });
		const paint = PAINT[kind];
		const grey =
			Math.round(
				0.2627 * data[i] + 0.678 * data[i + 1] + 0.0593 * data[i + 2],
			) * 0.6;
		out[i] = paint ? paint[0] : grey;
		out[i + 1] = paint ? paint[1] : grey;
		out[i + 2] = paint ? paint[2] : grey;
		out[i + 3] = 255;
	}
	return out;
}
