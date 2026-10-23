// A small, dependency-free builder for Lottie (Bodymovin 5.x) JSON, used to
// author the Worksuite Assets pack from code. Only the parts of the format
// the pack needs: shape layers, groups, rect/ellipse/star/path, fill,
// stroke and trim paths, with bezier-eased keyframes.

export type Vec = number[];
export type Ease = { o: [number, number]; i: [number, number] };

/** cubic-bezier(x1, y1, x2, y2) */
export const bezier = (x1: number, y1: number, x2: number, y2: number): Ease => ({
	o: [x1, y1],
	i: [x2, y2],
});

export const EASE = {
	linear: bezier(0, 0, 1, 1),
	out: bezier(0.22, 1, 0.36, 1),
	in: bezier(0.55, 0, 1, 0.45),
	inOut: bezier(0.65, 0, 0.35, 1),
	soft: bezier(0.45, 0, 0.55, 1),
	back: bezier(0.34, 1.56, 0.64, 1),
	backIn: bezier(0.36, 0, 0.66, -0.56),
} as const;

/** A keyframe: at frame `t` the value is `v`; `e` eases towards the next key. */
export type Key<T = number | Vec> = [t: number, v: T, e?: Ease];

export type Prop = { a: 0; k: unknown } | { a: 1; k: unknown[] };

const asArray = (v: number | Vec) => (Array.isArray(v) ? v : [v]);

export function value(v: number | Vec): Prop {
	return { a: 0, k: v };
}

export function anim(keys: Key[], fallback: Ease = EASE.inOut): Prop {
	if (keys.length === 1) return value(keys[0][1]);
	const sorted = [...keys].sort((a, b) => a[0] - b[0]);
	return {
		a: 1,
		k: sorted.map(([t, v, e], index) => {
			if (index === sorted.length - 1) return { t, s: asArray(v) };
			const ease = e ?? fallback;
			return {
				t,
				s: asArray(v),
				o: { x: [ease.o[0]], y: [ease.o[1]] },
				i: { x: [ease.i[0]], y: [ease.i[1]] },
			};
		}),
	};
}

/** Accepts a constant, a Prop, or a list of keys. */
export type PropInput = number | Vec | Prop | Key[];

export function prop(input: PropInput): Prop {
	if (typeof input === "number") return value(input);
	if (Array.isArray(input) && input.length > 0 && Array.isArray(input[0])) {
		return anim(input as Key[]);
	}
	if (Array.isArray(input)) return value(input as Vec);
	return input as Prop;
}

// ---------- colours ----------

export function rgb(hex: string): number[] {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	// Rounded so they read back as the exact same hex.
	return [r, g, b, 1].map((x) => Math.round(x * 10000) / 10000);
}

// ---------- shapes ----------

export type PathData = { i: Vec[]; o: Vec[]; v: Vec[]; c: boolean };
export type Shape = Record<string, unknown>;

export function rect(
	size: PropInput,
	position: PropInput = [0, 0],
	radius: PropInput = 0,
): Shape {
	return { ty: "rc", d: 1, s: prop(size), p: prop(position), r: prop(radius), nm: "Rect" };
}

export function ellipse(size: PropInput, position: PropInput = [0, 0]): Shape {
	return { ty: "el", d: 1, s: prop(size), p: prop(position), nm: "Ellipse" };
}

export function star({
	points,
	outer,
	inner,
	position = [0, 0],
	rotation = 0,
	outerRound = 0,
	innerRound = 0,
	polygon = false,
}: {
	points: number;
	outer: PropInput;
	inner?: PropInput;
	position?: PropInput;
	rotation?: PropInput;
	outerRound?: number;
	innerRound?: number;
	polygon?: boolean;
}): Shape {
	return {
		ty: "sr",
		sy: polygon ? 2 : 1,
		d: 1,
		pt: value(points),
		p: prop(position),
		r: prop(rotation),
		or: prop(outer),
		os: value(outerRound),
		...(polygon ? {} : { ir: prop(inner ?? 0), is: value(innerRound) }),
		nm: "Star",
	};
}

/** A path from points with optional relative in/out tangents per point. */
export function pathData(
	points: Array<[number, number] | [number, number, number, number, number, number]>,
	closed = false,
): PathData {
	return {
		v: points.map((p) => [p[0], p[1]]),
		i: points.map((p) => (p.length === 6 ? [p[2], p[3]] : [0, 0])),
		o: points.map((p) => (p.length === 6 ? [p[4], p[5]] : [0, 0])),
		c: closed,
	};
}

export function path(data: PathData | Key<PathData>[]): Shape {
	if (Array.isArray(data)) {
		const keys = [...data].sort((a, b) => a[0] - b[0]);
		return {
			ty: "sh",
			d: 1,
			ks: {
				a: 1,
				k: keys.map(([t, v, e], index) => {
					if (index === keys.length - 1) return { t, s: [v] };
					const ease = e ?? EASE.inOut;
					return {
						t,
						s: [v],
						o: { x: [ease.o[0]], y: [ease.o[1]] },
						i: { x: [ease.i[0]], y: [ease.i[1]] },
					};
				}),
			},
			nm: "Path",
		};
	}
	return { ty: "sh", d: 1, ks: { a: 0, k: data }, nm: "Path" };
}

export function fill(hex: string, opacity: PropInput = 100): Shape {
	return { ty: "fl", c: value(rgb(hex)), o: prop(opacity), r: 1, bm: 0, nm: "Fill" };
}

export function stroke(
	hex: string,
	width: PropInput,
	{ opacity = 100, cap = "round", join = "round" }: { opacity?: PropInput; cap?: "butt" | "round" | "square"; join?: "miter" | "round" | "bevel" } = {},
): Shape {
	return {
		ty: "st",
		c: value(rgb(hex)),
		o: prop(opacity),
		w: prop(width),
		lc: { butt: 1, round: 2, square: 3 }[cap],
		lj: { miter: 1, round: 2, bevel: 3 }[join],
		ml: 4,
		bm: 0,
		nm: "Stroke",
	};
}

export function trim(start: PropInput = 0, end: PropInput = 100, offset: PropInput = 0): Shape {
	return { ty: "tm", s: prop(start), e: prop(end), o: prop(offset), m: 1, nm: "Trim" };
}

export interface TransformInput {
	position?: PropInput;
	anchor?: PropInput;
	scale?: PropInput;
	rotation?: PropInput;
	opacity?: PropInput;
}

function groupTransform(t: TransformInput = {}): Shape {
	return {
		ty: "tr",
		p: prop(t.position ?? [0, 0]),
		a: prop(t.anchor ?? [0, 0]),
		s: prop(t.scale ?? [100, 100]),
		r: prop(t.rotation ?? 0),
		o: prop(t.opacity ?? 100),
		sk: value(0),
		sa: value(0),
		nm: "Transform",
	};
}

export function group(items: Shape[], transform: TransformInput = {}, name = "Group"): Shape {
	return {
		ty: "gr",
		it: [...items, groupTransform(transform)],
		nm: name,
		np: items.length,
		cix: 2,
		bm: 0,
	};
}

// ---------- layers & document ----------

export interface LayerInput extends TransformInput {
	name: string;
	shapes: Shape[];
	inPoint?: number;
	outPoint?: number;
	parent?: number;
}

export interface Doc {
	w: number;
	h: number;
	fps: number;
	frames: number;
	name: string;
}

export function buildAnimation(doc: Doc, layers: LayerInput[]) {
	// Layers are listed top first, as in After Effects.
	return {
		v: "5.7.4",
		fr: doc.fps,
		ip: 0,
		op: doc.frames,
		w: doc.w,
		h: doc.h,
		nm: doc.name,
		ddd: 0,
		assets: [],
		layers: layers.map((layer, index) => ({
			ddd: 0,
			ind: index + 1,
			ty: 4,
			nm: layer.name,
			sr: 1,
			ks: {
				o: prop(layer.opacity ?? 100),
				r: prop(layer.rotation ?? 0),
				p: prop(layer.position ?? [doc.w / 2, doc.h / 2]),
				a: prop(layer.anchor ?? [0, 0]),
				s: prop(layer.scale ?? [100, 100]),
			},
			ao: 0,
			shapes: layer.shapes,
			ip: layer.inPoint ?? 0,
			op: layer.outPoint ?? doc.frames,
			st: 0,
			bm: 0,
			...(layer.parent ? { parent: layer.parent } : {}),
		})),
		markers: [],
	};
}

// ---------- geometry helpers ----------

const KAPPA = 0.5522847498;

/** Bezier points for a circular arc, angles in degrees (0 = right, clockwise). */
export function arcPoints(
	cx: number,
	cy: number,
	r: number,
	from: number,
	to: number,
): Array<[number, number, number, number, number, number]> {
	const segments = Math.max(1, Math.ceil(Math.abs(to - from) / 90));
	const step = (to - from) / segments;
	const out: Array<[number, number, number, number, number, number]> = [];
	const handle = (4 / 3) * Math.tan((step * Math.PI) / 180 / 4) * r;
	for (let s = 0; s <= segments; s++) {
		const a = ((from + step * s) * Math.PI) / 180;
		const x = cx + Math.cos(a) * r;
		const y = cy + Math.sin(a) * r;
		const tx = -Math.sin(a) * handle;
		const ty = Math.cos(a) * handle;
		out.push([x, y, s === 0 ? 0 : -tx, s === 0 ? 0 : -ty, s === segments ? 0 : tx, s === segments ? 0 : ty]);
	}
	return out;
}

/** Smooth closed loop through points (Catmull-Rom to bezier). */
export function smoothLoop(points: Array<[number, number]>, tension = 1): PathData {
	const n = points.length;
	const result: Array<[number, number, number, number, number, number]> = points.map((p, index) => {
		const prev = points[(index - 1 + n) % n];
		const next = points[(index + 1) % n];
		const dx = ((next[0] - prev[0]) / 6) * tension;
		const dy = ((next[1] - prev[1]) / 6) * tension;
		return [p[0], p[1], -dx, -dy, dx, dy];
	});
	return pathData(result, true);
}

/** Smooth open curve through points. */
export function smoothLine(points: Array<[number, number]>, tension = 1): PathData {
	const n = points.length;
	const result: Array<[number, number, number, number, number, number]> = points.map((p, index) => {
		const prev = points[Math.max(0, index - 1)];
		const next = points[Math.min(n - 1, index + 1)];
		const dx = ((next[0] - prev[0]) / 6) * tension;
		const dy = ((next[1] - prev[1]) / 6) * tension;
		return [p[0], p[1], index === 0 ? 0 : -dx, index === 0 ? 0 : -dy, index === n - 1 ? 0 : dx, index === n - 1 ? 0 : dy];
	});
	return pathData(result, false);
}

export { KAPPA };

/** Deterministic random numbers so the pack builds the same every time. */
export function seeded(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
