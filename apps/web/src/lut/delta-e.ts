/**
 * Colour difference for LUT accuracy checks (SRS WS-48): sRGB/Rec.709
 * display values to CIELAB (D65), then CIEDE2000. ΔE below about 2 is not
 * noticeable side by side.
 */
type Rgb = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function rgbToLab(rgb: Rgb): [number, number, number] {
	const [r, g, b] = rgb.map((v) => toLinear(Math.min(1, Math.max(0, v))));
	const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047;
	const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
	const z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
	const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
	const fx = f(x);
	const fy = f(y);
	const fz = f(z);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** CIEDE2000 between two Lab colours. */
export function deltaE2000({ a, b }: { a: [number, number, number]; b: [number, number, number] }): number {
	const [L1, a1, b1] = a;
	const [L2, a2, b2] = b;
	const C1 = Math.hypot(a1, b1);
	const C2 = Math.hypot(a2, b2);
	const Cm = (C1 + C2) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.hypot(a1p, b1);
	const C2p = Math.hypot(a2p, b2);
	const h = ({ x, y }: { x: number; y: number }) => {
		if (x === 0 && y === 0) return 0;
		const v = deg(Math.atan2(y, x));
		return v < 0 ? v + 360 : v;
	};
	const h1p = h({ x: a1p, y: b1 });
	const h2p = h({ x: a2p, y: b2 });
	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp = 0;
	if (C1p * C2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
	const Lpm = (L1 + L2) / 2;
	const Cpm = (C1p + C2p) / 2;
	let hpm = h1p + h2p;
	if (C1p * C2p !== 0) {
		if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360;
		hpm /= 2;
	}
	const T =
		1 -
		0.17 * Math.cos(rad(hpm - 30)) +
		0.24 * Math.cos(rad(2 * hpm)) +
		0.32 * Math.cos(rad(3 * hpm + 6)) -
		0.2 * Math.cos(rad(4 * hpm - 63));
	const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
	const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
	const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
	const Sc = 1 + 0.045 * Cpm;
	const Sh = 1 + 0.015 * Cpm * T;
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
	return Math.sqrt(
		(dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
	);
}

export const deltaERgb = ({ a, b }: { a: Rgb; b: Rgb }) => deltaE2000({ a: rgbToLab(a), b: rgbToLab(b) });

/** Mean, 95th percentile and worst ΔE over pairs of colours. */
export function deltaEStats(pairs: [Rgb, Rgb][]): { mean: number; p95: number; max: number } {
	const values = pairs.map(([a, b]) => deltaERgb({ a, b })).sort((x, y) => x - y);
	const mean = values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
	return {
		mean,
		p95: values[Math.floor(values.length * 0.95)] ?? 0,
		max: values[values.length - 1] ?? 0,
	};
}
