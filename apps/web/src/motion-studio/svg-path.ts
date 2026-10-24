/**
 * SVG path data → Motion Studio path points. Handles M L H V C S Q T A Z,
 * absolute and relative; quadratic curves and arcs become cubic curves.
 * Each subpath becomes its own shape.
 */

import type { PathPoint } from "./model";

export interface Subpath {
	points: PathPoint[];
	closed: boolean;
}

type Pt = { x: number; y: number };

function tokens(d: string): Array<string | number> {
	const out: Array<string | number> = [];
	const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
	for (const m of d.matchAll(re)) out.push(m[1] ?? Number(m[2]));
	return out;
}

/** Arc segment as cubic curves (SVG implementation notes, F.6). */
function arcToCubics({ from, rx, ry, angle, large, sweep, to }: { from: Pt; rx: number; ry: number; angle: number; large: boolean; sweep: boolean; to: Pt }): Array<[Pt, Pt, Pt]> {
	if (!rx || !ry || (from.x === to.x && from.y === to.y)) return [[from, to, to]];
	const phi = (angle * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (from.x - to.x) / 2;
	const dy = (from.y - to.y) / 2;
	const x1 = cos * dx + sin * dy;
	const y1 = -sin * dx + cos * dy;
	rx = Math.abs(rx);
	ry = Math.abs(ry);
	const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const sign = large === sweep ? -1 : 1;
	const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
	const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
	const cx1 = (coef * rx * y1) / ry;
	const cy1 = (-coef * ry * x1) / rx;
	const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
	const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
	const ang = ({ ux, uy, vx, vy }: { ux: number; uy: number; vx: number; vy: number }) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	let start = ang({ ux: 1, uy: 0, vx: (x1 - cx1) / rx, vy: (y1 - cy1) / ry });
	let delta = ang({ ux: (x1 - cx1) / rx, uy: (y1 - cy1) / ry, vx: (-x1 - cx1) / rx, vy: (-y1 - cy1) / ry });
	if (!sweep && delta > 0) delta -= 2 * Math.PI;
	if (sweep && delta < 0) delta += 2 * Math.PI;
	const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
	const step = delta / segments;
	const k = (4 / 3) * Math.tan(step / 4);
	const point = (t: number) => ({
		x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
		y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
	});
	const deriv = (t: number) => ({
		x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
		y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
	});
	const out: Array<[Pt, Pt, Pt]> = [];
	for (let i = 0; i < segments; i++) {
		const t1 = start;
		const t2 = start + step;
		const p1 = point(t1);
		const p2 = i === segments - 1 ? to : point(t2);
		const d1 = deriv(t1);
		const d2 = deriv(t2);
		out.push([{ x: p1.x + k * d1.x, y: p1.y + k * d1.y }, { x: p2.x - k * d2.x, y: p2.y - k * d2.y }, p2]);
		start = t2;
	}
	return out;
}

export function parsePathData(d: string): Subpath[] {
	const t = tokens(d);
	const paths: Subpath[] = [];
	const cur: { v: Subpath | null } = { v: null };
	let pos: Pt = { x: 0, y: 0 };
	let startPt: Pt = { x: 0, y: 0 };
	let lastCtrl: Pt | null = null;
	let lastQuad: Pt | null = null;
	let cmd = "";
	let i = 0;
	const num = () => {
		const v = t[i++];
		return typeof v === "number" ? v : 0;
	};
	const begin = (p: Pt) => {
		if (cur.v && cur.v.points.length) paths.push(cur.v);
		cur.v = { points: [{ x: p.x, y: p.y }], closed: false };
		startPt = p;
	};
	const lineTo = (p: Pt) => {
		if (!cur.v) begin(pos);
		cur.v?.points.push({ x: p.x, y: p.y });
	};
	const curveTo = ({ c1, c2, p }: { c1: Pt; c2: Pt; p: Pt }) => {
		if (!cur.v) begin(pos);
		const pts = cur.v?.points ?? [];
		const last = pts[pts.length - 1];
		if (last) last.out = { x: c1.x - last.x, y: c1.y - last.y };
		pts.push({ x: p.x, y: p.y, in: { x: c2.x - p.x, y: c2.y - p.y } });
	};
	while (i < t.length) {
		if (typeof t[i] === "string") cmd = String(t[i++]);
		const rel = cmd === cmd.toLowerCase();
		const base = rel ? pos : { x: 0, y: 0 };
		const C = cmd.toUpperCase();
		if (C === "Z") {
			if (cur.v) {
				cur.v.closed = true;
				// A closing point that repeats the first one is dropped (its curve handle moves to the first).
				const pts = cur.v.points;
				const first = pts[0];
				const last = pts[pts.length - 1];
				if (pts.length > 1 && first && last && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
					first.in = last.in;
					pts.pop();
				}
				paths.push(cur.v);
				cur.v = null;
			}
			pos = startPt;
			lastCtrl = lastQuad = null;
			continue;
		}
		if (typeof t[i] !== "number") {
			i++;
			continue;
		}
		if (C === "M") {
			pos = { x: base.x + num(), y: base.y + num() };
			begin(pos);
			cmd = rel ? "l" : "L";
			lastCtrl = lastQuad = null;
		} else if (C === "L") {
			pos = { x: base.x + num(), y: base.y + num() };
			lineTo(pos);
			lastCtrl = lastQuad = null;
		} else if (C === "H") {
			pos = { x: (rel ? pos.x : 0) + num(), y: pos.y };
			lineTo(pos);
			lastCtrl = lastQuad = null;
		} else if (C === "V") {
			pos = { x: pos.x, y: (rel ? pos.y : 0) + num() };
			lineTo(pos);
			lastCtrl = lastQuad = null;
		} else if (C === "C") {
			const c1 = { x: base.x + num(), y: base.y + num() };
			const c2 = { x: base.x + num(), y: base.y + num() };
			const p = { x: base.x + num(), y: base.y + num() };
			curveTo({ c1, c2, p });
			pos = p;
			lastCtrl = c2;
			lastQuad = null;
		} else if (C === "S") {
			const c1 = lastCtrl ? { x: 2 * pos.x - lastCtrl.x, y: 2 * pos.y - lastCtrl.y } : pos;
			const c2 = { x: base.x + num(), y: base.y + num() };
			const p = { x: base.x + num(), y: base.y + num() };
			curveTo({ c1, c2, p });
			pos = p;
			lastCtrl = c2;
			lastQuad = null;
		} else if (C === "Q" || C === "T") {
			const q: Pt = C === "Q" ? { x: base.x + num(), y: base.y + num() } : lastQuad ? { x: 2 * pos.x - lastQuad.x, y: 2 * pos.y - lastQuad.y } : pos;
			const p = { x: base.x + num(), y: base.y + num() };
			curveTo({ c1: { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) }, c2: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p });
			pos = p;
			lastQuad = q;
			lastCtrl = null;
		} else if (C === "A") {
			const rx = num();
			const ry = num();
			const angle = num();
			const large = num() !== 0;
			const sweep = num() !== 0;
			const p = { x: base.x + num(), y: base.y + num() };
			for (const [c1, c2, end] of arcToCubics({ from: pos, rx, ry, angle, large, sweep, to: p })) curveTo({ c1, c2, p: end });
			pos = p;
			lastCtrl = lastQuad = null;
		} else i++;
	}
	if (cur.v?.points.length) paths.push(cur.v);
	return paths.filter((p) => p.points.length > 1);
}

/** Shifts subpaths so their joint box starts at 0,0; returns the shift. */
export function normalizeSubpaths(paths: Subpath[]): { paths: Subpath[]; minX: number; minY: number; width: number; height: number } {
	const all = paths.flatMap((p) => p.points);
	const minX = Math.min(...all.map((p) => p.x));
	const minY = Math.min(...all.map((p) => p.y));
	const maxX = Math.max(...all.map((p) => p.x));
	const maxY = Math.max(...all.map((p) => p.y));
	return {
		paths: paths.map((p) => ({ ...p, points: p.points.map((pt) => ({ ...pt, x: pt.x - minX, y: pt.y - minY })) })),
		minX,
		minY,
		width: maxX - minX,
		height: maxY - minY,
	};
}
