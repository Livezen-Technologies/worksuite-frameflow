/**
 * Motion Studio ⇄ Lottie. Lottie is an interchange format: export writes
 * shape, image and solid layers with keyframed transforms (text becomes a
 * picture so it looks the same everywhere); import brings back what maps
 * onto Motion Studio layers and lists what it had to leave out.
 */

import type { LottieJson } from "@/lottie/types";
import {
	ANIMATABLE,
	createMotionProject,
	DEFAULT_PLAYBACK,
	EASES,
	layerSize,
	newId,
	type AnimProp,
	type Ease,
	type Keyframe,
	type Layer,
	type MotionProject,
	type PathPoint,
} from "./model";

type Json = Record<string, unknown>;

export function hexToRgba(hex: string): [number, number, number, number] {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
	if (!m) return [0, 0, 0, 1];
	let h = m[1];
	if (h.length === 3) h = [...h].map((c) => c + c).join("");
	const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
	return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

export function rgbaToHex(c: unknown): string {
	const a = Array.isArray(c) ? c.map(Number) : [0, 0, 0];
	const to = (v: number) =>
		Math.round(Math.min(1, Math.max(0, v || 0)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${to(a[0])}${to(a[1])}${to(a[2])}`.toUpperCase();
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A Lottie property from keyframes (or a static value); `map` turns our value into Lottie's array. */
function prop({
	keys,
	value,
	fps,
	map,
}: {
	keys: Keyframe[] | undefined;
	value: number;
	fps: number;
	map: (v: number) => number[];
}): Json {
	if (!keys?.length) return { a: 0, k: map(value) };
	return {
		a: 1,
		k: keys.map((k, i) => {
			const frame: Json = { t: r3(k.t * fps), s: map(k.v) };
			if (i < keys.length - 1) {
				const [x1, y1, x2, y2] = k.ease;
				frame.o = { x: [x1], y: [y1] };
				frame.i = { x: [x2], y: [y2] };
			}
			return frame;
		}),
	};
}

function transform({ layer, fps }: { layer: Layer; fps: number }): Json {
	const { w, h } = layerSize(layer);
	const kf = layer.keyframes;
	return {
		o: prop({ keys: kf.opacity, value: layer.opacity, fps, map: (v) => [r3(v * 100)] }),
		r: prop({ keys: kf.rotation, value: layer.rotation, fps, map: (v) => [r3(v)] }),
		p: {
			s: true,
			x: prop({ keys: kf.x, value: layer.x, fps, map: (v) => [r3(v)] }),
			y: prop({ keys: kf.y, value: layer.y, fps, map: (v) => [r3(v)] }),
		},
		a: { a: 0, k: [r3(layer.anchorX * w), r3(layer.anchorY * h), 0] },
		s: prop({ keys: kf.scale, value: layer.scale, fps, map: (v) => [r3(v * 100), r3(v * 100), 100] }),
	};
}

function styleItems({ layer, closed }: { layer: { fill: string | null; stroke: string | null; strokeWidth: number }; closed: boolean }): Json[] {
	const items: Json[] = [];
	const fill = closed ? layer.fill : null;
	const stroke = layer.stroke ?? (closed ? null : (layer.fill ?? "#FFFFFF"));
	if (stroke && (layer.strokeWidth > 0 || !closed))
		items.push({ ty: "st", c: { a: 0, k: hexToRgba(stroke) }, o: { a: 0, k: 100 }, w: { a: 0, k: Math.max(1, layer.strokeWidth) }, lc: 2, lj: 2 });
	if (fill) items.push({ ty: "fl", c: { a: 0, k: hexToRgba(fill) }, o: { a: 0, k: 100 }, r: 1 });
	return items;
}

const groupTransform = { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } };

/** Turns a text layer into a picture: `{ src, w, h }`. Supplied by the caller (needs a canvas). */
export type RasterizeText = (layer: Extract<Layer, { kind: "text" }>) => Promise<{ src: string; w: number; h: number }>;

export async function motionToLottie({ project, rasterizeText }: { project: MotionProject; rasterizeText: RasterizeText }): Promise<LottieJson> {
	const fps = project.fps;
	const op = Math.max(1, Math.round(project.duration * fps));
	const assets: Json[] = [];
	const layers: Json[] = [];
	const visible = project.layers.filter((l) => l.visible);
	let ind = 1;
	// Lottie draws its first layer on top.
	for (const layer of [...visible].reverse()) {
		const common = { ddd: 0, ind: ind++, nm: layer.name, sr: 1, ks: transform({ layer, fps }), ao: 0, ip: 0, op, st: 0, bm: 0 };
		if (layer.kind === "image" || layer.kind === "text") {
			const pic = layer.kind === "image" ? { src: layer.src, w: layer.w, h: layer.h } : await rasterizeText(layer);
			const id = `image_${assets.length}`;
			assets.push({ id, w: Math.round(pic.w), h: Math.round(pic.h), u: "", p: pic.src, e: 1 });
			layers.push({ ...common, ty: 2, refId: id });
			continue;
		}
		let shape: Json;
		let closed = true;
		if (layer.kind === "rect")
			shape = { ty: "rc", d: 1, p: { a: 0, k: [layer.w / 2, layer.h / 2] }, s: { a: 0, k: [layer.w, layer.h] }, r: { a: 0, k: layer.radius } };
		else if (layer.kind === "ellipse") shape = { ty: "el", d: 1, p: { a: 0, k: [layer.w / 2, layer.h / 2] }, s: { a: 0, k: [layer.w, layer.h] } };
		else {
			closed = layer.closed;
			shape = {
				ty: "sh",
				ks: {
					a: 0,
					k: {
						c: layer.closed,
						v: layer.points.map((p) => [r3(p.x), r3(p.y)]),
						i: layer.points.map((p) => [r3(p.in?.x ?? 0), r3(p.in?.y ?? 0)]),
						o: layer.points.map((p) => [r3(p.out?.x ?? 0), r3(p.out?.y ?? 0)]),
					},
				},
			};
		}
		layers.push({ ...common, ty: 4, shapes: [{ ty: "gr", nm: layer.name, it: [shape, ...styleItems({ layer, closed }), groupTransform] }] });
	}
	if (project.background)
		layers.push({
			ddd: 0,
			ind: ind++,
			ty: 1,
			nm: "Background",
			sr: 1,
			ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
			ao: 0,
			sc: project.background,
			sw: project.width,
			sh: project.height,
			ip: 0,
			op,
			st: 0,
			bm: 0,
		});
	return { v: "5.7.0", fr: fps, ip: 0, op, w: project.width, h: project.height, nm: project.name, ddd: 0, assets, layers, markers: [] };
}

// ---- Import -------------------------------------------------------------

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
/** A number from a Lottie value (or the first of an array); undefined if there isn't one. */
function numOf(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (Array.isArray(v) && typeof v[0] === "number") return v[0];
	return undefined;
}
const num = (v: unknown) => numOf(v) ?? 0;

interface Track {
	value: number;
	keys?: Keyframe[];
}

/** Reads a (possibly animated) Lottie property, component `index`, mapped by `scale`. */
function readTrack({ p, index, fps, scale = 1, fallback = 0 }: { p: unknown; index: number; fps: number; scale?: number; fallback?: number }): Track {
	if (!isObj(p)) return { value: fallback };
	const k = p.k;
	const pick = (v: unknown) => (Array.isArray(v) ? (numOf(v[index]) ?? fallback * (1 / scale)) : (numOf(v) ?? fallback / scale)) * scale;
	if (p.a === 1 && Array.isArray(k) && isObj(k[0])) {
		const keys: Keyframe[] = [];
		for (let i = 0; i < k.length; i++) {
			const f = k[i];
			if (!isObj(f)) continue;
			// Old exports put the value only in the previous keyframe's `e`.
			const before: unknown = i > 0 ? k[i - 1] : null;
			const prev = isObj(before) ? before : null;
			const s = f.s ?? prev?.e;
			if (s === undefined) continue;
			const o = isObj(f.o) ? f.o : null;
			const inn = isObj(f.i) ? f.i : null;
			const ease: Ease =
				o && inn ? [Math.min(1, Math.max(0, num(o.x))), num(o.y), Math.min(1, Math.max(0, (numOf(inn.x) ?? 1))), (numOf(inn.y) ?? 1)] : EASES.linear;
			keys.push({ t: num(f.t) / fps, v: pick(s), ease: f.h === 1 ? [1, 0, 1, 0] : ease });
		}
		if (keys.length) return { value: keys[0].v, keys };
	}
	return { value: Array.isArray(k) ? pick(k) : (numOf(k) ?? fallback / scale) * scale };
}

export interface LottieImport {
	project: MotionProject;
	/** What couldn't be brought in as editable layers. */
	warnings: string[];
}

export function lottieToMotion({ json, name }: { json: LottieJson; name?: string }): LottieImport {
	const fps = json.fr;
	const warnings = new Set<string>();
	const project = createMotionProject({
		name: name ?? json.nm ?? "Imported animation",
		width: json.w,
		height: json.h,
		fps: Math.round(fps),
		duration: Math.max(0.1, (json.op - json.ip) / fps),
	});
	project.playback = { ...DEFAULT_PLAYBACK };
	const assets = new Map<string, Json>();
	for (const a of json.assets ?? []) if (isObj(a) && typeof a.id === "string") assets.set(a.id, a);
	const shift = json.ip / fps;
	const layers: Layer[] = [];

	for (const raw of [...json.layers].reverse()) {
		if (!isObj(raw)) continue;
		const ty = raw.ty;
		const nm = typeof raw.nm === "string" ? raw.nm : "Layer";
		if (raw.parent !== undefined) warnings.add("Parented layers are placed on their own (their parent's motion isn't followed).");
		if (raw.hasMask || Array.isArray(raw.masksProperties)) warnings.add("Masks were left out.");
		if (Array.isArray(raw.ef) && raw.ef.length) warnings.add("Effects were left out.");
		if (JSON.stringify(raw.ks ?? {}).includes('"x":"')) warnings.add("Expressions were left out.");
		const ks = isObj(raw.ks) ? raw.ks : {};
		const pos = isObj(ks.p) ? ks.p : {};
		const tracks: Record<AnimProp, Track> = {
			x: pos.s ? readTrack({ p: pos.x, index: 0, fps }) : readTrack({ p: ks.p, index: 0, fps }),
			y: pos.s ? readTrack({ p: pos.y, index: 0, fps }) : readTrack({ p: ks.p, index: 1, fps }),
			scale: readTrack({ p: ks.s, index: 0, fps, scale: 0.01, fallback: 1 }),
			rotation: readTrack({ p: ks.r, index: 0, fps }),
			opacity: readTrack({ p: ks.o, index: 0, fps, scale: 0.01, fallback: 1 }),
		};
		if (isObj(ks.s) && ks.s.a !== 1 && Array.isArray(ks.s.k) && num(ks.s.k[0]) !== num(ks.s.k[1]))
			warnings.add("Uneven (non-uniform) scale became uniform scale.");
		const anchor = { x: readTrack({ p: ks.a, index: 0, fps }).value, y: readTrack({ p: ks.a, index: 1, fps }).value };
		const groupId = undefined;
		const build = (extra: { name: string; w: number; h: number; ox: number; oy: number }) => {
			const keyframes: Layer["keyframes"] = {};
			for (const p of ANIMATABLE) {
				const keys = tracks[p].keys;
				if (keys) keyframes[p] = keys.map((k) => ({ ...k, t: Math.max(0, k.t - shift) }));
			}
			return {
				id: newId(),
				name: extra.name,
				visible: raw.hd !== true,
				locked: false,
				groupId,
				x: tracks.x.value,
				y: tracks.y.value,
				scale: tracks.scale.value,
				rotation: tracks.rotation.value,
				opacity: tracks.opacity.value,
				anchorX: extra.w ? (anchor.x - extra.ox) / extra.w : 0,
				anchorY: extra.h ? (anchor.y - extra.oy) / extra.h : 0,
				keyframes,
			};
		};

		if (ty === 2) {
			const asset = typeof raw.refId === "string" ? assets.get(raw.refId) : undefined;
			const src = asset && typeof asset.p === "string" ? (asset.e === 1 || asset.p.startsWith("data:") ? asset.p : `${asset.u ?? ""}${asset.p}`) : null;
			if (!asset || !src) {
				warnings.add("Pictures that aren't inside the file were left out.");
				continue;
			}
			const w = (numOf(asset.w) ?? 100);
			const h = (numOf(asset.h) ?? 100);
			layers.push({ ...build({ name: nm, w, h, ox: 0, oy: 0 }), kind: "image", src, w, h });
		} else if (ty === 1) {
			const w = (numOf(raw.sw) ?? json.w);
			const h = (numOf(raw.sh) ?? json.h);
			const fill = typeof raw.sc === "string" ? raw.sc : "#000000";
			layers.push({ ...build({ name: nm, w, h, ox: 0, oy: 0 }), kind: "rect", w, h, radius: 0, fill, stroke: null, strokeWidth: 0 });
		} else if (ty === 5) {
			const doc = isObj(raw.t) && isObj(raw.t.d) && Array.isArray(raw.t.d.k) && isObj(raw.t.d.k[0]) && isObj(raw.t.d.k[0].s) ? raw.t.d.k[0].s : null;
			if (!doc) continue;
			const fontSize = (numOf(doc.s) ?? 48);
			const text = String(doc.t ?? "").replace(/\r/g, "\n");
			// Lottie text sits on its baseline at the layer origin.
			const l = build({ name: nm, w: 0, h: 0, ox: 0, oy: 0 });
			layers.push({
				...l,
				anchorX: 0,
				anchorY: 0,
				y: l.y - fontSize * 0.8,
				kind: "text",
				text,
				fontSize,
				fontFamily: typeof doc.f === "string" ? doc.f.replace(/-.*$/, "") : "Inter",
				fontWeight: /bold/i.test(String(doc.f)) ? 700 : 400,
				fill: rgbaToHex(doc.fc),
			});
			warnings.add("Text keeps its words, size and colour; text animators were left out.");
		} else if (ty === 4 && Array.isArray(raw.shapes)) {
			const found = collectShapes({ items: raw.shapes, warnings });
			if (!found.length) warnings.add("Some shape layers had nothing that could be edited.");
			found.forEach((s, i) => {
				const label = found.length > 1 ? `${nm} ${i + 1}` : nm;
				if (s.kind === "path") {
					const xs = s.points.map((p) => p.x);
					const ys = s.points.map((p) => p.y);
					const minX = Math.min(0, ...xs);
					const minY = Math.min(0, ...ys);
					// Our path box starts at 0,0: shift points that go negative and move the anchor to match.
					const points = s.points.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
					const w = Math.max(1, ...points.map((p) => p.x));
					const h = Math.max(1, ...points.map((p) => p.y));
					layers.push({ ...build({ name: label, w, h, ox: minX, oy: minY }), kind: "path", points, closed: s.closed, ...s.style });
				} else {
					const common = { ...build({ name: label, w: s.w, h: s.h, ox: s.cx - s.w / 2, oy: s.cy - s.h / 2 }), w: s.w, h: s.h, ...s.style };
					layers.push(s.kind === "rect" ? { ...common, kind: "rect", radius: s.radius } : { ...common, kind: "ellipse" });
				}
			});
		} else if (ty === 0) warnings.add("Pre-compositions were left out.");
		else if (ty === 3) continue; // Null layers only move their children.
		else warnings.add(`A layer of an unsupported type (${String(ty)}) was left out.`);
	}
	project.layers = layers;
	return { project, warnings: [...warnings] };
}

type Style = { fill: string | null; stroke: string | null; strokeWidth: number };
type FoundShape =
	| { kind: "rect"; cx: number; cy: number; w: number; h: number; radius: number; style: Style }
	| { kind: "ellipse"; cx: number; cy: number; w: number; h: number; style: Style }
	| { kind: "path"; points: PathPoint[]; closed: boolean; style: Style };

function collectShapes({ items, warnings, inherited }: { items: unknown[]; warnings: Set<string>; inherited?: Style }): FoundShape[] {
	const list = items.filter(isObj);
	const style: Style = { ...(inherited ?? { fill: null, stroke: null, strokeWidth: 0 }) };
	for (const it of list) {
		if (it.ty === "fl" && isObj(it.c)) style.fill = rgbaToHex(it.c.k);
		else if (it.ty === "st" && isObj(it.c)) {
			style.stroke = rgbaToHex(it.c.k);
			style.strokeWidth = (numOf(isObj(it.w) ? it.w.k : 1) ?? 1);
		} else if (it.ty === "gf" || it.ty === "gs") warnings.add("Gradients became solid colours.");
		else if (it.ty === "tm") warnings.add("Trim paths were left out.");
		else if (it.ty === "rp") warnings.add("Repeaters were left out.");
	}
	if (list.some((it) => it.ty === "gf") && !style.fill) style.fill = "#888888";
	const out: FoundShape[] = [];
	for (const it of list) {
		if (it.ty === "gr" && Array.isArray(it.it)) {
			const tr = it.it.filter(isObj).find((x) => x.ty === "tr");
			if (tr && JSON.stringify([tr.p, tr.s, tr.r]) !== JSON.stringify([{ a: 0, k: [0, 0] }, { a: 0, k: [100, 100] }, { a: 0, k: 0 }]))
				if ((isObj(tr.p) && tr.p.a === 1) || (isObj(tr.s) && tr.s.a === 1) || (isObj(tr.r) && tr.r.a === 1) || num(isObj(tr.r) ? tr.r.k : 0) !== 0)
					warnings.add("Motion inside shape groups was left out.");
			const dx = isObj(tr?.p) && Array.isArray(tr.p.k) ? num(tr.p.k[0]) - (isObj(tr.a) && Array.isArray(tr.a.k) ? num(tr.a.k[0]) : 0) : 0;
			const dy = isObj(tr?.p) && Array.isArray(tr.p.k) ? num(tr.p.k[1]) - (isObj(tr.a) && Array.isArray(tr.a.k) ? num(tr.a.k[1]) : 0) : 0;
			for (const s of collectShapes({ items: it.it, warnings, inherited: style }))
				out.push(
					s.kind === "path"
						? { ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
						: { ...s, cx: s.cx + dx, cy: s.cy + dy },
				);
		} else if (it.ty === "rc" || it.ty === "el") {
			if ((isObj(it.s) && it.s.a === 1) || (isObj(it.p) && it.p.a === 1)) warnings.add("Animated shape sizes were left at their first frame.");
			const p = isObj(it.p) ? it.p.k : [0, 0];
			const s = isObj(it.s) ? it.s.k : [100, 100];
			const first = (v: unknown) => (Array.isArray(v) && isObj(v[0]) && Array.isArray(v[0].s) ? v[0].s : v);
			const pp = first(p);
			const ss = first(s);
			const cx = Array.isArray(pp) ? num(pp[0]) : 0;
			const cy = Array.isArray(pp) ? num(pp[1]) : 0;
			const w = Array.isArray(ss) ? (numOf(ss[0]) ?? 100) : 100;
			const h = Array.isArray(ss) ? (numOf(ss[1]) ?? 100) : 100;
			out.push(
				it.ty === "rc"
					? { kind: "rect", cx, cy, w, h, radius: num(isObj(it.r) ? it.r.k : 0), style }
					: { kind: "ellipse", cx, cy, w, h, style },
			);
		} else if (it.ty === "sh" && isObj(it.ks)) {
			let k = it.ks.k;
			if (it.ks.a === 1) {
				warnings.add("Path morphing was left at its first shape.");
				k = Array.isArray(k) && isObj(k[0]) && Array.isArray(k[0].s) ? k[0].s[0] : null;
			}
			if (!isObj(k) || !Array.isArray(k.v)) continue;
			const pairs = (list: unknown): Array<[number, number]> =>
				(Array.isArray(list) ? list : []).map((item: unknown): [number, number] => (Array.isArray(item) ? [num(item[0]), num(item[1])] : [0, 0]));
			const v = pairs(k.v);
			const inn = pairs(k.i);
			const o = pairs(k.o);
			const handle = (h: [number, number] | undefined) => (h && (h[0] || h[1]) ? { x: h[0], y: h[1] } : undefined);
			out.push({
				kind: "path",
				closed: k.c === true,
				points: v.map((pt, i) => ({ x: pt[0], y: pt[1], in: handle(inn[i]), out: handle(o[i]) })),
				style,
			});
		} else if (it.ty === "sr") warnings.add("Polystar shapes were left out.");
	}
	return out;
}
