import { applyCube, type CubeLut, cubeToRgba8 } from "./cube";

type Rgb = [number, number, number];

/** The LUT as the GPU sees it: texels stored at 8 bits (WS-48). */
export function asStored(lut: CubeLut): CubeLut {
	const rgba = cubeToRgba8(lut);
	const data = new Float32Array(lut.size ** 3 * 3);
	for (let i = 0; i < lut.size ** 3; i++)
		for (let c = 0; c < 3; c++) data[i * 3 + c] = (rgba[i * 4 + c] ?? 0) / 255;
	return { ...lut, data };
}

/** FrameFlow's result for one 8-bit source pixel: stored LUT, trilinear, rounded to 8 bits. */
export function frameflowPixel({ stored, rgb }: { stored: CubeLut; rgb: Rgb }): Rgb {
	const [r, g, b] = applyCube({ lut: stored, rgb });
	const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
	return [q(r), q(g), q(b)];
}

/** A binary PPM (P6), the simplest format ffmpeg writes: `-frames:v 1 -pix_fmt rgb24 x.ppm`. */
export function parsePpm(bytes: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
	let at = 0;
	const token = () => {
		while (at < bytes.length) {
			const c = bytes[at]!;
			if (c === 35) while (at < bytes.length && bytes[at] !== 10) at++;
			else if (c <= 32) at++;
			else break;
		}
		const start = at;
		while (at < bytes.length && bytes[at]! > 32) at++;
		return new TextDecoder().decode(bytes.subarray(start, at));
	};
	if (token() !== "P6") throw new Error("Not a binary PPM (P6)");
	const width = Number(token());
	const height = Number(token());
	const max = Number(token());
	if (max !== 255) throw new Error("Only 8-bit PPM is supported");
	at++;
	return { width, height, rgb: bytes.subarray(at, at + width * height * 3) };
}
