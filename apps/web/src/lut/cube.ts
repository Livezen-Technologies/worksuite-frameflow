/** A parsed 3D LUT (Adobe/Resolve .cube, SRS WS-11). */
export interface CubeLut {
	title: string;
	size: number;
	/** size³ RGB triplets, red fastest, values 0–1 after DOMAIN scaling. */
	data: Float32Array;
}

export class CubeParseError extends Error {}

/** Parses a .cube file. 1D LUTs are refused (they're rare for colour). */
export function parseCube(text: string): CubeLut {
	let title = "";
	let size = 0;
	let domainMin = [0, 0, 0];
	let domainMax = [1, 1, 1];
	const values: number[] = [];

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const upper = line.toUpperCase();
		if (upper.startsWith("TITLE")) {
			title = line.slice(5).trim().replace(/^"|"$/g, "");
		} else if (upper.startsWith("LUT_1D_SIZE")) {
			throw new CubeParseError(
				"This is a 1D LUT. FrameFlow needs a 3D LUT (.cube with LUT_3D_SIZE).",
			);
		} else if (upper.startsWith("LUT_3D_SIZE")) {
			size = Number.parseInt(line.split(/\s+/)[1] ?? "", 10);
		} else if (upper.startsWith("DOMAIN_MIN")) {
			domainMin = line.split(/\s+/).slice(1, 4).map(Number);
		} else if (upper.startsWith("DOMAIN_MAX")) {
			domainMax = line.split(/\s+/).slice(1, 4).map(Number);
		} else if (/^[A-Z_]+/.test(upper)) {
			// Other keywords (LUT_3D_INPUT_RANGE etc.) don't change the data.
		} else {
			const parts = line.split(/\s+/);
			if (parts.length < 3) throw new CubeParseError(`Bad line: ${line}`);
			for (let i = 0; i < 3; i++) values.push(Number(parts[i]));
		}
	}

	if (!Number.isInteger(size) || size < 2 || size > 65) {
		throw new CubeParseError("Missing or unsupported LUT_3D_SIZE (2–65).");
	}
	if (values.length !== size * size * size * 3) {
		throw new CubeParseError(
			`Expected ${size ** 3} colours for a ${size}-point LUT, found ${values.length / 3}.`,
		);
	}
	if (values.some((v) => !Number.isFinite(v))) {
		throw new CubeParseError("The LUT contains values that aren't numbers.");
	}
	const data = new Float32Array(values.length);
	for (let i = 0; i < values.length; i++) {
		const c = i % 3;
		const span = domainMax[c] - domainMin[c] || 1;
		data[i] = (values[i] - domainMin[c]) / span;
	}
	return { title, size, data };
}

/** RGBA8 texels for the GPU (alpha 255), clamped to 0–1. */
export function cubeToRgba8(lut: CubeLut): Uint8Array {
	const texels = lut.size ** 3;
	const out = new Uint8Array(texels * 4);
	for (let i = 0; i < texels; i++) {
		for (let c = 0; c < 3; c++) {
			const v = Math.min(1, Math.max(0, lut.data[i * 3 + c]));
			out[i * 4 + c] = Math.round(v * 255);
		}
		out[i * 4 + 3] = 255;
	}
	return out;
}

/** Applies a LUT to one colour in JS (trilinear), for tests and previews. */
export function applyCube({
	lut,
	rgb,
}: {
	lut: CubeLut;
	rgb: [number, number, number];
}) {
	const n = lut.size;
	const at = ({ r, g, b, c }: { r: number; g: number; b: number; c: number }) =>
		lut.data[((b * n + g) * n + r) * 3 + c];
	const pos = rgb.map((v) => Math.min(1, Math.max(0, v)) * (n - 1));
	const i0 = pos.map((p) => Math.floor(p));
	const i1 = i0.map((i) => Math.min(i + 1, n - 1));
	const f = pos.map((p, k) => p - i0[k]);
	const out: [number, number, number] = [0, 0, 0];
	for (let c = 0; c < 3; c++) {
		let sum = 0;
		for (let corner = 0; corner < 8; corner++) {
			const ri = corner & 1 ? i1[0] : i0[0];
			const gi = corner & 2 ? i1[1] : i0[1];
			const bi = corner & 4 ? i1[2] : i0[2];
			const w =
				(corner & 1 ? f[0] : 1 - f[0]) *
				(corner & 2 ? f[1] : 1 - f[1]) *
				(corner & 4 ? f[2] : 1 - f[2]);
			sum += w * at({ r: ri, g: gi, b: bi, c });
		}
		out[c] = sum;
	}
	return out;
}
