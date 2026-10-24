import type { LottieJson } from "@/lottie/types";

/**
 * Animated template backgrounds (the Mixed, 1,000 and Video packs): a
 * gradient with rays, lanterns, lotus petals, a split, moving stripes, a
 * "video" vignette, a frame, falling confetti or waves. Drawn on a canvas
 * for library previews, and built as a Lottie for the timeline, so the
 * clip looks the same in the editor, the preview and the export.
 */
export const BACKDROP_TYPES = ["rays", "lanterns", "lotus", "grad", "split", "stripes", "video", "frame", "confetti", "wave"] as const;
export type BackdropType = (typeof BACKDROP_TYPES)[number];

export interface Backdrop {
	t: BackdropType;
	/** Two or three colours: gradient start, gradient end, accent. */
	c: string[];
}

export function isBackdrop(value: unknown): value is Backdrop {
	if (!value || typeof value !== "object") return false;
	const t = "t" in value ? value.t : undefined;
	const c = "c" in value ? value.c : undefined;
	return BACKDROP_TYPES.some((x) => x === t) && Array.isArray(c) && c.length > 0 && c.every((x) => typeof x === "string");
}

const colorsOf = (bg: Backdrop) => [bg.c[0]!, bg.c[1] ?? bg.c[0]!, bg.c[2] ?? bg.c[1] ?? bg.c[0]!];
const CONFETTI = ["#F15BB5", "#00BBF9", "#FEE440", "#FFFFFF"];
const STRIPE_SPEED = 30;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws the backdrop at time `t` (seconds) into a w×h box. */
export function drawBackdrop({ ctx, bg, width: w, height: h, time: t }: { ctx: Ctx; bg: Backdrop; width: number; height: number; time: number }) {
	const [c0, c1, c2] = colorsOf(bg);
	ctx.save();
	const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
	g.addColorStop(0, c0);
	g.addColorStop(1, c1);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);
	switch (bg.t) {
		case "rays":
			ctx.translate(w / 2, h * 0.45);
			ctx.rotate(t * 0.08);
			ctx.fillStyle = `${c2}55`;
			for (let i = 0; i < 18; i++) {
				ctx.rotate(Math.PI / 9);
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(w * 1.2, -w * 0.08);
				ctx.lineTo(w * 1.2, w * 0.08);
				ctx.fill();
			}
			break;
		case "lanterns":
			for (const l of lanterns({ w, h, t })) {
				ctx.fillStyle = c2;
				ctx.shadowColor = c2;
				ctx.shadowBlur = l.r * 3;
				ctx.globalAlpha = l.alpha;
				ctx.beginPath();
				ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
				ctx.fill();
			}
			break;
		case "lotus":
			ctx.translate(w / 2, h * 0.9);
			ctx.globalAlpha = 0.35;
			ctx.fillStyle = c2;
			for (let i = -3; i <= 3; i++) {
				ctx.save();
				ctx.rotate(i * 0.35 + Math.sin(t) * 0.02);
				ctx.beginPath();
				ctx.ellipse(0, -h * 0.18, h * 0.07, h * 0.2, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			}
			break;
		case "split":
			ctx.fillStyle = c1;
			ctx.beginPath();
			ctx.moveTo(0, h * 0.55);
			ctx.lineTo(w, h * 0.4);
			ctx.lineTo(w, h);
			ctx.lineTo(0, h);
			ctx.fill();
			break;
		case "stripes": {
			ctx.fillStyle = c1;
			const s = h * 0.12;
			const o = (t * STRIPE_SPEED) % (s * 2);
			for (let x = -h - s * 2 + o; x < w + h; x += s * 2) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x + s, 0);
				ctx.lineTo(x + s + h, h);
				ctx.lineTo(x + h, h);
				ctx.fill();
			}
			break;
		}
		case "video": {
			const v = ctx.createRadialGradient(w * 0.55, h * 0.4, h * 0.1, w * 0.5, h * 0.5, w * 0.7);
			v.addColorStop(0, c0);
			v.addColorStop(1, c1);
			ctx.fillStyle = v;
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = "rgba(255,255,255,0.06)";
			ctx.beginPath();
			ctx.ellipse(w * 0.62, h * 0.45, h * 0.16, h * 0.2, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillRect(w * 0.5, h * 0.62, h * 0.5, h * 0.4);
			break;
		}
		case "frame": {
			ctx.strokeStyle = c2;
			ctx.lineWidth = Math.max(2, h * 0.006);
			const m = h * 0.05;
			ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
			ctx.lineWidth /= 2;
			ctx.strokeRect(m * 1.4, m * 1.4, w - 2.8 * m, h - 2.8 * m);
			ctx.fillStyle = c2;
			for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]] as const) {
				ctx.beginPath();
				ctx.arc(x, y, h * 0.012, 0, Math.PI * 2);
				ctx.fill();
			}
			break;
		}
		case "confetti":
			for (let i = 0; i < 40; i++) {
				const p = confetti({ i, w, h, t });
				ctx.fillStyle = i % 5 === 0 ? c2 : CONFETTI[(i % 5) - 1]!;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate(p.r);
				ctx.fillRect(-h * 0.008, -h * 0.016, h * 0.016, h * 0.032);
				ctx.restore();
			}
			break;
		case "wave":
			ctx.strokeStyle = c2;
			ctx.globalAlpha = 0.5;
			ctx.lineWidth = Math.max(1.5, h * 0.005);
			for (let k = 0; k < 4; k++) {
				ctx.beginPath();
				for (const [i, [x, y]] of wavePoints({ k, w, h, t }).entries()) {
					if (i) ctx.lineTo(x, y);
					else ctx.moveTo(x, y);
				}
				ctx.stroke();
			}
			break;
		default:
			break;
	}
	ctx.restore();
}

function lanterns({ w, h, t }: { w: number; h: number; t: number }) {
	return Array.from({ length: 14 }, (_, i) => ({
		x: (((i * 97) % 100) / 100) * w,
		y: (((i * 53) % 60) / 100 + 0.05) * h + Math.sin(t * 1.2 + i) * h * 0.015,
		r: h * (0.02 + ((i * 7) % 5) / 200),
		alpha: 0.55 + 0.35 * Math.sin(t * 2 + i),
	}));
}

function confetti({ i, w, h, t }: { i: number; w: number; h: number; t: number }) {
	return {
		x: (((i * 37) % 100) / 100) * w,
		y: ((((i * 61) % 100) / 100) * h + t * h * 0.12 * (1 + (i % 3))) % h,
		r: t * 2 + i,
	};
}

function wavePoints({ k, w, h, t }: { k: number; w: number; h: number; t: number }): [number, number][] {
	const out: [number, number][] = [];
	for (let n = 0; n <= 60; n++) {
		const x = (n / 60) * w;
		out.push([x, h * (0.8 + k * 0.04) + Math.sin((x / w) * 12 + t * 2 + k) * h * 0.03 * Math.sin(t + k)]);
	}
	return out;
}

// ---------- Lottie ----------

const rgb = (hex: string) => {
	const m = /^#?([0-9a-f]{6})/i.exec(hex);
	const n = m ? Number.parseInt(m[1]!, 16) : 0xffffff;
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const round = (n: number) => Math.round(n * 100) / 100;
const still = (k: unknown) => ({ a: 0, k });
const EASE = { o: { x: [0.33], y: [0.33] }, i: { x: [0.67], y: [0.67] } };

/** Keyframes sampled from f(t); a jump (wrap-around) is held, not tweened. */
function sampled({ f, duration, fps, rate = 10, jump = Infinity }: { f: (t: number) => number[]; duration: number; fps: number; rate?: number; jump?: number }) {
	const keys: Record<string, unknown>[] = [];
	const steps = Math.max(1, Math.ceil(duration * rate));
	let prev: number[] | null = null;
	for (let s = 0; s <= steps; s++) {
		const t = (s / steps) * duration;
		const v = f(t).map(round);
		const last = keys[keys.length - 1];
		if (prev && last && v.some((x, i) => Math.abs(x - prev![i]!) > jump)) {
			// Hold the old value until just before the wrap, then start fresh.
			last.h = 1;
		}
		keys.push({ t: round(t * fps), s: v, ...EASE });
		prev = v;
	}
	return { a: 1, k: keys };
}

const tr = (extra: Record<string, unknown> = {}) => ({
	ty: "tr",
	p: still([0, 0]),
	a: still([0, 0]),
	s: still([100, 100]),
	r: still(0),
	o: still(100),
	sk: still(0),
	sa: still(0),
	...extra,
});
const fill = (hex: string, opacity = 100) => ({ ty: "fl", c: still([...rgb(hex), 1]), o: still(opacity), r: 1 });
const stroke = (hex: string, width: number, opacity = 100) => ({ ty: "st", c: still([...rgb(hex), 1]), o: still(opacity), w: still(width), lc: 2, lj: 2 });
const path = (points: [number, number][], closed = true) => ({
	ty: "sh",
	ks: still({ i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), v: points.map(([x, y]) => [round(x), round(y)]), c: closed }),
});
const rect = (x: number, y: number, w: number, h: number) => ({ ty: "rc", p: still([round(x + w / 2), round(y + h / 2)]), s: still([round(w), round(h)]), r: still(0) });
const ellipse = (x: number, y: number, rx: number, ry: number) => ({ ty: "el", p: still([round(x), round(y)]), s: still([round(rx * 2), round(ry * 2)]) });
const group = (items: unknown[], transform: Record<string, unknown> = {}) => ({ ty: "gr", it: [...items, tr(transform)] });
const layer = ({ name, shapes, ip, op, ks = {} }: { name: string; shapes: unknown[]; ip: number; op: number; ks?: Record<string, unknown> }) => ({
	ddd: 0,
	ty: 4,
	nm: name,
	sr: 1,
	ip,
	op,
	st: 0,
	bm: 0,
	ks: { o: still(100), r: still(0), p: still([0, 0, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]), ...ks },
	shapes,
});
const gradient = ({ kind, start, end, from, to }: { kind: 1 | 2; start: number[]; end: number[]; from: string; to: string }) => ({
	ty: "gf",
	o: still(100),
	r: 1,
	t: kind,
	s: still(start.map(round)),
	e: still(end.map(round)),
	g: { p: 2, k: still([0, ...rgb(from), 1, ...rgb(to)]) },
});

/** The backdrop as a Lottie the size of the frame, `duration` seconds long. */
export function backdropLottie({ bg, width: w, height: h, duration, fps = 30 }: { bg: Backdrop; width: number; height: number; duration: number; fps?: number }): LottieJson {
	const [c0, c1, c2] = colorsOf(bg);
	const op = Math.max(1, Math.round(duration * fps));
	const layers: unknown[] = [];
	const add = (name: string, shapes: unknown[], ks?: Record<string, unknown>) => layers.unshift(layer({ name, shapes, ip: 0, op, ks }));
	const D = duration;

	add("Gradient", [group([rect(0, 0, w, h), gradient({ kind: 1, start: [0, 0], end: [w * 0.4, h], from: c0, to: c1 })])]);

	switch (bg.t) {
		case "rays": {
			const tris = Array.from({ length: 18 }, (_, i) => {
				const a = ((i + 1) * Math.PI) / 9;
				const rot = ([x, y]: [number, number]): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
				return path([rot([0, 0]), rot([w * 1.2, -w * 0.08]), rot([w * 1.2, w * 0.08])]);
			});
			add("Rays", [group([...tris, fill(c2, 33)])], {
				p: still([w / 2, h * 0.45, 0]),
				r: { a: 1, k: [{ t: 0, s: [0], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: op, s: [round((D * 0.08 * 180) / Math.PI)] }] },
			});
			break;
		}
		case "lanterns":
			add(
				"Lanterns",
				Array.from({ length: 14 }, (_, i) => {
					const at = (t: number) => lanterns({ w, h, t })[i]!;
					const r = at(0).r;
					return group([ellipse(0, 0, r * 2.2, r * 2.2), fill(c2, 18), group([ellipse(0, 0, r, r), fill(c2)])], {
						p: sampled({ f: (t) => [at(t).x, at(t).y], duration: D, fps }),
						o: sampled({ f: (t) => [Math.max(0, Math.min(100, at(t).alpha * 100))], duration: D, fps }),
					});
				}),
			);
			break;
		case "lotus":
			add(
				"Lotus",
				Array.from({ length: 7 }, (_, n) => {
					const i = n - 3;
					return group([ellipse(0, -h * 0.18, h * 0.07, h * 0.2), fill(c2)], {
						r: sampled({ f: (t) => [((i * 0.35 + Math.sin(t) * 0.02) * 180) / Math.PI], duration: D, fps, rate: 6 }),
					});
				}),
				{ p: still([w / 2, h * 0.9, 0]), o: still(35) },
			);
			break;
		case "split":
			add("Split", [group([path([[0, h * 0.55], [w, h * 0.4], [w, h], [0, h]]), fill(c1)])]);
			break;
		case "stripes": {
			const s = h * 0.12;
			const travel = D * STRIPE_SPEED;
			const shapes: unknown[] = [];
			for (let x = -h - s * 2 - Math.ceil(travel / (s * 2)) * s * 2; x < w + h; x += s * 2) {
				shapes.push(path([[x, 0], [x + s, 0], [x + s + h, h], [x + h, h]]));
			}
			add("Stripes", [group([...shapes, fill(c1)])], {
				p: { a: 1, k: [{ t: 0, s: [0, 0, 0], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: op, s: [round(travel), 0, 0] }] },
			});
			break;
		}
		case "video":
			add("Vignette", [
				group([ellipse(w * 0.62, h * 0.45, h * 0.16, h * 0.2), rect(w * 0.5, h * 0.62, h * 0.5, h * 0.4), fill("#FFFFFF", 6)]),
				group([rect(0, 0, w, h), gradient({ kind: 2, start: [w * 0.55, h * 0.4], end: [w * 0.55 + w * 0.7, h * 0.4], from: c0, to: c1 })]),
			]);
			break;
		case "frame": {
			const m = h * 0.05;
			const lw = Math.max(2, h * 0.006);
			add("Frame", [
				group([rect(m, m, w - 2 * m, h - 2 * m), stroke(c2, lw)]),
				group([rect(m * 1.4, m * 1.4, w - 2.8 * m, h - 2.8 * m), stroke(c2, lw / 2)]),
				group([...[[m, m], [w - m, m], [m, h - m], [w - m, h - m]].map(([x, y]) => ellipse(x!, y!, h * 0.012, h * 0.012)), fill(c2)]),
			]);
			break;
		}
		case "confetti":
			add(
				"Confetti",
				Array.from({ length: 40 }, (_, i) =>
					group([rect(-h * 0.008, -h * 0.016, h * 0.016, h * 0.032), fill(i % 5 === 0 ? c2 : CONFETTI[(i % 5) - 1]!)], {
						p: sampled({ f: (t) => { const p = confetti({ i, w, h, t }); return [p.x, p.y]; }, duration: D, fps, rate: 10, jump: h / 2 }),
						r: { a: 1, k: [{ t: 0, s: [round((i * 180) / Math.PI)], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: op, s: [round(((D * 2 + i) * 180) / Math.PI)] }] },
					}),
				),
			);
			break;
		case "wave":
			add(
				"Waves",
				Array.from({ length: 4 }, (_, k) => {
					const keys = sampled({ f: () => [0], duration: D, fps, rate: 8 }).k.map((key) => {
						const t = Number(key.t) / fps;
						const pts = wavePoints({ k, w, h, t });
						return { ...key, s: [{ i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]), v: pts.map(([x, y]) => [round(x), round(y)]), c: false }] };
					});
					return group([{ ty: "sh", ks: { a: 1, k: keys } }, stroke(c2, Math.max(1.5, h * 0.005), 50)]);
				}),
			);
			break;
		default:
			break;
	}
	return { v: "5.7.4", fr: fps, ip: 0, op, w: Math.round(w), h: Math.round(h), nm: `Backdrop ${bg.t}`, ddd: 0, assets: [], layers };
}

/** A short text key for a backdrop clip ("rays|#FFB020,#E2531B,#7A1E0E|1920x1080|5"). */
export function backdropSpec({ bg, width, height, duration }: { bg: Backdrop; width: number; height: number; duration: number }) {
	return `${bg.t}|${bg.c.join(",")}|${Math.round(width)}x${Math.round(height)}|${round(duration)}`;
}

export function parseBackdropSpec(spec: string): { bg: Backdrop; width: number; height: number; duration: number } | null {
	const [t, colors, size, duration] = spec.split("|");
	const [width, height] = (size ?? "").split("x").map(Number);
	const bg = { t, c: (colors ?? "").split(",").filter(Boolean) };
	if (!isBackdrop(bg) || !(width! > 0) || !(height! > 0) || !(Number(duration) > 0)) return null;
	return { bg, width: width!, height: height!, duration: Number(duration) };
}
