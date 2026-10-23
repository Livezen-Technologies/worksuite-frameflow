/**
 * Nadir logo (SRS VR-19): a flat logo becomes the bottom pole of an
 * equirectangular frame, so in a headset it lies flat on the ground under
 * the viewer. Returns RGBA for the full frame, transparent outside the patch.
 */
export function warpNadirLogo({
	logo,
	width,
	height,
	sizeDeg,
}: {
	logo: { width: number; height: number; data: Uint8ClampedArray };
	width: number;
	height: number;
	/** Angle from straight down to the patch edge. */
	sizeDeg: number;
}): Uint8ClampedArray {
	const out = new Uint8ClampedArray(width * height * 4);
	const band = Math.min(height / 2, Math.round((sizeDeg / 180) * height));
	const side = Math.min(logo.width, logo.height);
	const ox = (logo.width - side) / 2;
	const oy = (logo.height - side) / 2;
	for (let y = height - band; y < height; y++) {
		// 0 at the pole (bottom row), 1 at the patch edge.
		const r = (height - 0.5 - y) / band;
		for (let x = 0; x < width; x++) {
			const theta = ((x + 0.5) / width) * 2 * Math.PI;
			// Looking down, longitude runs round the disc; "front" (centre of the frame) is at the top of the logo.
			const lx = ox + (0.5 + 0.5 * r * Math.sin(theta)) * side;
			const ly = oy + (0.5 + 0.5 * r * Math.cos(theta)) * side;
			const sx = Math.min(logo.width - 1, Math.max(0, Math.floor(lx)));
			const sy = Math.min(logo.height - 1, Math.max(0, Math.floor(ly)));
			const s = (sy * logo.width + sx) * 4;
			const o = (y * width + x) * 4;
			// Round logos stay round; corners of a square logo outside the disc are dropped.
			out[o] = logo.data[s]!;
			out[o + 1] = logo.data[s + 1]!;
			out[o + 2] = logo.data[s + 2]!;
			out[o + 3] = r <= 1 ? logo.data[s + 3]! : 0;
		}
	}
	return out;
}
