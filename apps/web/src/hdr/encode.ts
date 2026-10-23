import { hlgToScene, LUMA_2020 } from "./tonemap";

/**
 * Turns the composited HLG signal (8-bit RGBA from the compositor) into a
 * 10-bit BT.2020 Y'CbCr 4:2:0 frame for HDR export (SRS HD-14), re-encoding
 * to PQ for HDR10 projects.
 */

const HLG_SCENE = Array.from({ length: 256 }, (_, i) => hlgToScene(i / 255));

const M1 = 2610 / 16384;
const M2 = (2523 / 4096) * 128;
const C1 = 3424 / 4096;
const C2 = (2413 / 4096) * 32;
const C3 = (2392 / 4096) * 32;

/** Display light in nits to a PQ signal (0..1). */
export function nitsToPq(nits: number): number {
	const y = (Math.max(nits, 0) / 10000) ** M1;
	return ((C1 + C2 * y) / (1 + C3 * y)) ** M2;
}

/** VP9 Profile 2 codec strings with BT.2020 and the transfer in the bitstream header. */
export const HDR_CODEC_STRINGS = {
	hlg: "vp09.02.10.10.01.09.18.09.00",
	pq: "vp09.02.10.10.01.09.16.09.00",
} as const;

export function rgbaToI420P10({
	rgba,
	width,
	height,
	transfer,
}: {
	rgba: Uint8ClampedArray;
	width: number;
	height: number;
	transfer: "hlg" | "pq";
}): Uint16Array<ArrayBuffer> {
	const cw = width >> 1;
	const ch = height >> 1;
	const out = new Uint16Array(width * height + 2 * cw * ch);
	const cbSum = new Float32Array(cw * ch);
	const crSum = new Float32Array(cw * ch);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			let r = rgba[i] / 255;
			let g = rgba[i + 1] / 255;
			let b = rgba[i + 2] / 255;
			if (transfer === "pq") {
				const sr = HLG_SCENE[rgba[i]];
				const sg = HLG_SCENE[rgba[i + 1]];
				const sb = HLG_SCENE[rgba[i + 2]];
				const ys = Math.max(
					LUMA_2020[0] * sr + LUMA_2020[1] * sg + LUMA_2020[2] * sb,
					1e-6,
				);
				const gain = 1000 * ys ** 0.2;
				r = nitsToPq(sr * gain);
				g = nitsToPq(sg * gain);
				b = nitsToPq(sb * gain);
			}
			const luma = LUMA_2020[0] * r + LUMA_2020[1] * g + LUMA_2020[2] * b;
			out[y * width + x] = Math.round(64 + 876 * luma);
			const c = (y >> 1) * cw + (x >> 1);
			if (x >> 1 < cw && y >> 1 < ch) {
				cbSum[c] += (b - luma) / 1.8814;
				crSum[c] += (r - luma) / 1.4746;
			}
		}
	}
	const uOffset = width * height;
	const vOffset = uOffset + cw * ch;
	for (let c = 0; c < cw * ch; c++) {
		out[uOffset + c] = Math.round(512 + 896 * (cbSum[c] / 4));
		out[vOffset + c] = Math.round(512 + 896 * (crSum[c] / 4));
	}
	return out;
}

/**
 * A 10-bit BT.2020 VideoFrame. TypeScript's DOM types predate the
 * WebCodecs high-bit-depth formats and HDR transfers (I420P10, "hlg",
 * "pq"), which Chromium supports, so the init object is widened here.
 */
export function hdrVideoFrame({
	data,
	width,
	height,
	timestamp,
	duration,
	transfer,
}: {
	data: Uint16Array<ArrayBuffer>;
	width: number;
	height: number;
	timestamp: number;
	duration: number;
	transfer: "hlg" | "pq";
}): VideoFrame {
	const init = {
		format: "I420P10",
		codedWidth: width,
		codedHeight: height,
		timestamp,
		duration,
		colorSpace: {
			primaries: "bt2020",
			transfer,
			matrix: "bt2020-ncl",
			fullRange: false,
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
	return new VideoFrame(data, init as unknown as VideoFrameBufferInit);
}
