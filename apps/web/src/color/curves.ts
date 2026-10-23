/**
 * Curves and HSL secondary grading (SRS WS-09, HSL qualifier). Every
 * operation is a function of the pixel's colour alone, so the whole stack
 * is baked into a 3D LUT and drawn by the engine's LUT shader; nothing new
 * runs on the GPU.
 */

export type CurvePoint = [number, number];

export type CurveChannel =
	| "luma"
	| "red"
	| "green"
	| "blue"
	| "hueVsHue"
	| "hueVsSat";

/** Points along x 0..1. Hue curves use y 0.5 as "no change". */
export type Curves = Record<CurveChannel, CurvePoint[]>;

export interface HslQualifier {
	enabled: boolean;
	/** Hue centre 0..1 and width 0..1 (fraction of the colour wheel). */
	hue: number;
	hueWidth: number;
	satMin: number;
	satMax: number;
	lumMin: number;
	lumMax: number;
	/** Edge softness 0..1. */
	softness: number;
	invert: boolean;
	/** Show the selection as black and white instead of the result. */
	showMask: boolean;
	/** Adjustments inside the selection. */
	hueShift: number;
	saturation: number;
	lightness: number;
}

export const IDENTITY_CURVE: CurvePoint[] = [
	[0, 0],
	[1, 1],
];
export const FLAT_HUE_CURVE: CurvePoint[] = [
	[0, 0.5],
	[1, 0.5],
];

export const DEFAULT_CURVES: Curves = {
	luma: IDENTITY_CURVE,
	red: IDENTITY_CURVE,
	green: IDENTITY_CURVE,
	blue: IDENTITY_CURVE,
	hueVsHue: FLAT_HUE_CURVE,
	hueVsSat: FLAT_HUE_CURVE,
};

export const DEFAULT_QUALIFIER: HslQualifier = {
	enabled: false,
	hue: 0.08,
	hueWidth: 0.12,
	satMin: 0.15,
	satMax: 1,
	lumMin: 0.05,
	lumMax: 0.95,
	softness: 0.3,
	invert: false,
	showMask: false,
	hueShift: 0,
	saturation: 1,
	lightness: 0,
};

const HUE_CHANNELS = new Set<CurveChannel>(["hueVsHue", "hueVsSat"]);
export const isHueChannel = (channel: CurveChannel) =>
	HUE_CHANNELS.has(channel);

/** "x:y,x:y" ⇄ points, for storing curves in effect params. */
export function serializeCurve(points: CurvePoint[]): string {
	return points.map(([x, y]) => `${+x.toFixed(4)}:${+y.toFixed(4)}`).join(",");
}

export function parseCurve({
	text,
	fallback,
}: {
	text: unknown;
	fallback: CurvePoint[];
}): CurvePoint[] {
	if (typeof text !== "string" || !text.trim()) return fallback;
	const points = text
		.split(",")
		.map((pair) => pair.split(":").map(Number))
		.filter(
			(p): p is [number, number] => p.length === 2 && p.every(Number.isFinite),
		)
		.map(
			([x, y]): CurvePoint => [
				Math.min(1, Math.max(0, x)),
				Math.min(1, Math.max(0, y)),
			],
		)
		.sort((a, b) => a[0] - b[0]);
	return points.length >= 2 ? points : fallback;
}

/**
 * Monotone cubic (Fritsch–Carlson) through the points: smooth, and never
 * overshoots between points, so a curve can't invert tones by accident.
 */
export function evaluateCurve({
	points,
	x,
	periodic = false,
}: {
	points: CurvePoint[];
	x: number;
	periodic?: boolean;
}): number {
	let pts = points;
	if (periodic) {
		// Hue wraps: extend one point either side so 0 and 1 meet smoothly.
		const first = points[0];
		const last = points[points.length - 1];
		pts = [[last[0] - 1, last[1]], ...points, [first[0] + 1, first[1]]];
		x = ((x % 1) + 1) % 1;
	}
	const n = pts.length;
	if (x <= pts[0][0]) return pts[0][1];
	if (x >= pts[n - 1][0]) return pts[n - 1][1];
	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx[i] = Math.max(pts[i + 1][0] - pts[i][0], 1e-6);
		slope[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
	}
	const m: number[] = [slope[0]];
	for (let i = 1; i < n - 1; i++) {
		m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
	}
	m[n - 1] = slope[n - 2];
	for (let i = 0; i < n - 1; i++) {
		if (slope[i] === 0) {
			m[i] = 0;
			m[i + 1] = 0;
			continue;
		}
		const a = m[i] / slope[i];
		const b = m[i + 1] / slope[i];
		const h = a * a + b * b;
		if (h > 9) {
			const t = 3 / Math.sqrt(h);
			m[i] = t * a * slope[i];
			m[i + 1] = t * b * slope[i];
		}
	}
	let i = 0;
	while (i < n - 2 && x > pts[i + 1][0]) i++;
	const t = (x - pts[i][0]) / dx[i];
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		(2 * t3 - 3 * t2 + 1) * pts[i][1] +
		(t3 - 2 * t2 + t) * dx[i] * m[i] +
		(-2 * t3 + 3 * t2) * pts[i + 1][1] +
		(t3 - t2) * dx[i] * m[i + 1]
	);
}

export function rgbToHsl([r, g, b]: [number, number, number]): [
	number,
	number,
	number,
] {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h / 6, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): [
	number,
	number,
	number,
] {
	if (s <= 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const channel = (t: number) => {
		const u = ((t % 1) + 1) % 1;
		if (u < 1 / 6) return p + (q - p) * 6 * u;
		if (u < 1 / 2) return q;
		if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
		return p;
	};
	return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/** Smooth 0..1 membership for value within [lo, hi], softened by `soft`. */
function band({
	v,
	lo,
	hi,
	soft,
}: {
	v: number;
	lo: number;
	hi: number;
	soft: number;
}): number {
	const s = Math.max(soft, 1e-4);
	const up = Math.min(1, Math.max(0, (v - (lo - s)) / s));
	const down = Math.min(1, Math.max(0, (hi + s - v) / s));
	return Math.min(up, down);
}

/** How much a colour belongs to the qualifier's selection, 0..1. */
export function qualifierWeight({
	hsl,
	q,
}: {
	hsl: [number, number, number];
	q: HslQualifier;
}): number {
	const [h, s, l] = hsl;
	let dh = Math.abs(h - q.hue);
	dh = Math.min(dh, 1 - dh);
	const soft = q.softness * 0.15;
	const hueW = band({ v: dh, lo: -1, hi: q.hueWidth / 2, soft: soft + 1e-3 });
	// Grey pixels have no meaningful hue.
	const satW = band({ v: s, lo: q.satMin, hi: q.satMax, soft });
	const lumW = band({ v: l, lo: q.lumMin, hi: q.lumMax, soft });
	const w = hueW * satW * lumW;
	return q.invert ? 1 - w : w;
}

const LUMA = [0.2126, 0.7152, 0.0722];

/** The whole curves + HSL stack for one colour (0..1 sRGB in and out). */
export function gradeColor({
	rgb,
	curves,
	qualifier,
}: {
	rgb: [number, number, number];
	curves: Curves;
	qualifier: HslQualifier;
}): [number, number, number] {
	let [r, g, b] = rgb;
	// Luma curve: change brightness, keep the colour's ratios.
	const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
	const y2 = evaluateCurve({ points: curves.luma, x: y });
	if (y > 1e-5) {
		const k = y2 / y;
		r *= k;
		g *= k;
		b *= k;
	} else {
		r = g = b = y2;
	}
	r = evaluateCurve({ points: curves.red, x: Math.min(1, Math.max(0, r)) });
	g = evaluateCurve({ points: curves.green, x: Math.min(1, Math.max(0, g)) });
	b = evaluateCurve({ points: curves.blue, x: Math.min(1, Math.max(0, b)) });

	let hsl = rgbToHsl([r, g, b]);
	if (hsl[1] > 0) {
		const shift =
			evaluateCurve({ points: curves.hueVsHue, x: hsl[0], periodic: true }) -
			0.5;
		const satGain =
			2 * evaluateCurve({ points: curves.hueVsSat, x: hsl[0], periodic: true });
		hsl = [(hsl[0] + shift + 1) % 1, Math.min(1, hsl[1] * satGain), hsl[2]];
	}

	if (qualifier.enabled) {
		const w = qualifierWeight({ hsl, q: qualifier });
		if (qualifier.showMask) return [w, w, w];
		const adjusted: [number, number, number] = [
			(hsl[0] + qualifier.hueShift + 1) % 1,
			Math.min(1, hsl[1] * qualifier.saturation),
			Math.min(1, Math.max(0, hsl[2] + qualifier.lightness)),
		];
		const a = hslToRgb(hsl);
		const c = hslToRgb(adjusted);
		return [
			a[0] + (c[0] - a[0]) * w,
			a[1] + (c[1] - a[1]) * w,
			a[2] + (c[2] - a[2]) * w,
		];
	}
	return hslToRgb(hsl);
}

export const BAKE_SIZE = 33;

/** RGBA8 3D LUT in the engine's layout (red fastest, then green, then blue). */
export function bakeLut({
	curves,
	qualifier,
	size = BAKE_SIZE,
}: {
	curves: Curves;
	qualifier: HslQualifier;
	size?: number;
}): Uint8Array {
	const out = new Uint8Array(size ** 3 * 4);
	let o = 0;
	for (let bi = 0; bi < size; bi++)
		for (let gi = 0; gi < size; gi++)
			for (let ri = 0; ri < size; ri++) {
				const c = gradeColor({
					rgb: [ri / (size - 1), gi / (size - 1), bi / (size - 1)],
					curves,
					qualifier,
				});
				out[o++] = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
				out[o++] = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
				out[o++] = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
				out[o++] = 255;
			}
	return out;
}
