/**
 * Motion Studio projects: an editable vector animation format of our own.
 * Lottie is only an import/export format, because not everything here maps
 * onto it. Coordinates are canvas pixels, time is seconds, angles degrees.
 */

export type Ease = [number, number, number, number];

export const EASES = {
	linear: [0, 0, 1, 1],
	easeIn: [0.42, 0, 1, 1],
	easeOut: [0, 0, 0.58, 1],
	easeInOut: [0.42, 0, 0.58, 1],
} satisfies Record<string, Ease>;

export const ANIMATABLE = ["x", "y", "scale", "rotation", "opacity"] as const;
export type AnimProp = (typeof ANIMATABLE)[number];

export interface Keyframe {
	t: number;
	v: number;
	/** Easing from this keyframe to the next. */
	ease: Ease;
}

export interface PathPoint {
	x: number;
	y: number;
	/** Bezier handles, relative to the point. */
	in?: { x: number; y: number };
	out?: { x: number; y: number };
}

interface LayerBase {
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	groupId?: string;
	/** Anchor (the layer's origin) on the canvas. */
	x: number;
	y: number;
	scale: number;
	rotation: number;
	opacity: number;
	/** Anchor point inside the layer's box, 0–1. */
	anchorX: number;
	anchorY: number;
	keyframes: Partial<Record<AnimProp, Keyframe[]>>;
}

export interface ShapeStyle {
	fill: string | null;
	stroke: string | null;
	strokeWidth: number;
}

export type Layer =
	| (LayerBase & ShapeStyle & { kind: "rect"; w: number; h: number; radius: number })
	| (LayerBase & ShapeStyle & { kind: "ellipse"; w: number; h: number })
	| (LayerBase & ShapeStyle & { kind: "path"; points: PathPoint[]; closed: boolean })
	| (LayerBase & {
			kind: "text";
			text: string;
			fontSize: number;
			fontFamily: string;
			fontWeight: number;
			fill: string;
	  })
	| (LayerBase & { kind: "image"; src: string; w: number; h: number });

export type LayerKind = Layer["kind"];

export interface LayerGroup {
	id: string;
	name: string;
	collapsed: boolean;
}

export interface MotionProject {
	id: string;
	name: string;
	width: number;
	height: number;
	fps: number;
	/** Seconds. */
	duration: number;
	/** Null is transparent. */
	background: string | null;
	/** Bottom to top. */
	layers: Layer[];
	groups: LayerGroup[];
	/** Absent in older projects: loop forwards at normal speed. */
	playback?: PlaybackSettings;
	/** Published to the video editor's Motion tab; kept up to date on save. */
	usedInVideo?: boolean;
	createdAt: number;
	updatedAt: number;
}

export function newId(prefix = "l"): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createMotionProject({
	name = "Untitled motion",
	width = 1920,
	height = 1080,
	fps = 30,
	duration = 5,
}: Partial<Pick<MotionProject, "name" | "width" | "height" | "fps" | "duration">> = {}): MotionProject {
	const now = Date.now();
	return {
		id: newId("m"),
		name,
		width,
		height,
		fps,
		duration,
		background: null,
		layers: [],
		groups: [],
		createdAt: now,
		updatedAt: now,
	};
}

const base = ({ name, x, y }: { name: string; x: number; y: number }) => ({
	id: newId(),
	name,
	visible: true,
	locked: false,
	x,
	y,
	scale: 1,
	rotation: 0,
	opacity: 1,
	anchorX: 0.5,
	anchorY: 0.5,
	keyframes: {},
});

/** A new layer of `kind`, centred on the canvas. */
export function createLayer({ kind, project }: { kind: "rect" | "ellipse" | "text" | "star"; project: MotionProject }): Layer {
	const cx = project.width / 2;
	const cy = project.height / 2;
	const size = Math.round(Math.min(project.width, project.height) / 4);
	const style = { fill: "#3B82F6", stroke: null, strokeWidth: 0 };
	if (kind === "rect")
		return { ...base({ name: "Rectangle", x: cx, y: cy }), ...style, kind, w: size, h: size, radius: 0 };
	if (kind === "ellipse")
		return { ...base({ name: "Ellipse", x: cx, y: cy }), ...style, fill: "#22D3EE", kind, w: size, h: size };
	if (kind === "star") {
		const points: PathPoint[] = [];
		for (let i = 0; i < 10; i++) {
			const r = i % 2 ? size * 0.2 : size * 0.5;
			const a = (Math.PI / 5) * i - Math.PI / 2;
			points.push({ x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a) });
		}
		return { ...base({ name: "Star", x: cx, y: cy }), ...style, fill: "#F59E0B", kind: "path", points, closed: true };
	}
	return {
		...base({ name: "Text", x: cx, y: cy }),
		kind: "text",
		text: "Your title",
		fontSize: Math.round(project.height / 10),
		fontFamily: "Inter",
		fontWeight: 700,
		fill: "#FFFFFF",
	};
}

/** Cubic-bezier easing: progress 0–1 to eased 0–1. */
export function easeAt({ ease, p }: { ease: Ease; p: number }): number {
	const [x1, y1, x2, y2] = ease;
	if (p <= 0) return 0;
	if (p >= 1) return 1;
	if (x1 === y1 && x2 === y2) return p;
	const bez = ({ a, b, s }: { a: number; b: number; s: number }) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
	let lo = 0;
	let hi = 1;
	let s = p;
	for (let i = 0; i < 30; i++) {
		s = (lo + hi) / 2;
		if (bez({ a: x1, b: x2, s }) < p) lo = s;
		else hi = s;
	}
	return bez({ a: y1, b: y2, s });
}

/** A property's value at `t`: its keyframes if it has any, otherwise its static value. */
export function valueAt({ layer, prop, t }: { layer: Layer; prop: AnimProp; t: number }): number {
	const keys = layer.keyframes[prop];
	if (!keys?.length) return layer[prop];
	if (t <= keys[0].t) return keys[0].v;
	const last = keys[keys.length - 1];
	if (t >= last.t) return last.v;
	for (let i = 0; i < keys.length - 1; i++) {
		const a = keys[i];
		const b = keys[i + 1];
		if (t >= a.t && t <= b.t) {
			const p = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
			return a.v + (b.v - a.v) * easeAt({ ease: a.ease, p });
		}
	}
	return last.v;
}

/** Adds or replaces the keyframe of `prop` at `t` (kept in time order). */
export function setKeyframe({
	layer,
	prop,
	t,
	v,
	ease = EASES.easeInOut,
}: {
	layer: Layer;
	prop: AnimProp;
	t: number;
	v: number;
	ease?: Ease;
}): Layer {
	const keys = (layer.keyframes[prop] ?? []).filter((k) => Math.abs(k.t - t) > 1e-6);
	const existing = layer.keyframes[prop]?.find((k) => Math.abs(k.t - t) <= 1e-6);
	keys.push({ t, v, ease: existing?.ease ?? ease });
	keys.sort((a, b) => a.t - b.t);
	return { ...layer, keyframes: { ...layer.keyframes, [prop]: keys } };
}

export function removeKeyframe({ layer, prop, t }: { layer: Layer; prop: AnimProp; t: number }): Layer {
	const keys = (layer.keyframes[prop] ?? []).filter((k) => Math.abs(k.t - t) > 1e-6);
	const keyframes = { ...layer.keyframes, [prop]: keys };
	if (!keys.length) delete keyframes[prop];
	return { ...layer, keyframes };
}

/**
 * Sets a property from an edit at time `t`: animated properties get a
 * keyframe there (auto-key), others change their static value.
 */
export function editProp({ layer, prop, t, v }: { layer: Layer; prop: AnimProp; t: number; v: number }): Layer {
	if (layer.keyframes[prop]?.length) return setKeyframe({ layer, prop, t, v });
	return { ...layer, [prop]: v };
}

let measureContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function textWidth(layer: Extract<Layer, { kind: "text" }>): number {
	if (typeof OffscreenCanvas !== "undefined") {
		measureContext ??= new OffscreenCanvas(1, 1).getContext("2d");
		if (measureContext) {
			measureContext.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}", sans-serif`;
			return Math.max(...layer.text.split("\n").map((line) => measureContext?.measureText(line).width ?? 0));
		}
	}
	return Math.max(...layer.text.split("\n").map((line) => line.length)) * layer.fontSize * 0.55;
}

/** The layer's own box (before transform), origin at its top-left. */
export function layerSize(layer: Layer): { w: number; h: number } {
	switch (layer.kind) {
		case "rect":
		case "ellipse":
		case "image":
			return { w: layer.w, h: layer.h };
		case "text":
			return { w: textWidth(layer), h: layer.text.split("\n").length * layer.fontSize * 1.2 };
		case "path": {
			const xs = layer.points.map((p) => p.x);
			const ys = layer.points.map((p) => p.y);
			return { w: Math.max(1, ...xs), h: Math.max(1, ...ys) };
		}
	}
}

/** SVG path data for a path layer. */
export function pathD({ points, closed }: { points: PathPoint[]; closed: boolean }): string {
	if (!points.length) return "";
	const r = (n: number) => Math.round(n * 100) / 100;
	let d = `M${r(points[0].x)} ${r(points[0].y)}`;
	const segment = ({ a, b }: { a: PathPoint; b: PathPoint }) => {
		if (!a.out && !b.in) return ` L${r(b.x)} ${r(b.y)}`;
		const c1 = { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) };
		const c2 = { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) };
		return ` C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(b.x)} ${r(b.y)}`;
	};
	for (let i = 1; i < points.length; i++) d += segment({ a: points[i - 1], b: points[i] });
	if (closed && points.length > 2) d += `${segment({ a: points[points.length - 1], b: points[0] })} Z`;
	return d;
}

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Axis-aligned canvas bounds of a layer at `t`. */
export function layerBounds({ layer, t }: { layer: Layer; t: number }): Box {
	const { w, h } = layerSize(layer);
	const x = valueAt({ layer, prop: "x", t });
	const y = valueAt({ layer, prop: "y", t });
	const s = valueAt({ layer, prop: "scale", t });
	const a = (valueAt({ layer, prop: "rotation", t }) * Math.PI) / 180;
	const corners = [
		[0, 0],
		[w, 0],
		[w, h],
		[0, h],
	].map(([cx, cy]) => {
		const px = (cx - layer.anchorX * w) * s;
		const py = (cy - layer.anchorY * h) * s;
		return { x: x + px * Math.cos(a) - py * Math.sin(a), y: y + px * Math.sin(a) + py * Math.cos(a) };
	});
	return {
		left: Math.min(...corners.map((c) => c.x)),
		right: Math.max(...corners.map((c) => c.x)),
		top: Math.min(...corners.map((c) => c.y)),
		bottom: Math.max(...corners.map((c) => c.y)),
	};
}

export interface Guide {
	axis: "x" | "y";
	at: number;
}

/**
 * Snaps a moving box to the canvas edges and centre and to other layers'
 * edges and centres. Returns the offset to add and the guides to draw.
 */
export function snapBox({
	box,
	targets,
	threshold,
}: {
	box: Box;
	targets: Box[];
	threshold: number;
}): { dx: number; dy: number; guides: Guide[] } {
	const xs = targets.flatMap((b) => [b.left, (b.left + b.right) / 2, b.right]);
	const ys = targets.flatMap((b) => [b.top, (b.top + b.bottom) / 2, b.bottom]);
	const pick = ({ own, lines }: { own: number[]; lines: number[] }) => {
		let best: { delta: number; at: number } | null = null;
		for (const o of own)
			for (const l of lines) {
				const delta = l - o;
				if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: l };
			}
		return best;
	};
	const sx = pick({ own: [box.left, (box.left + box.right) / 2, box.right], lines: xs });
	const sy = pick({ own: [box.top, (box.top + box.bottom) / 2, box.bottom], lines: ys });
	const guides: Guide[] = [];
	if (sx) guides.push({ axis: "x", at: sx.at });
	if (sy) guides.push({ axis: "y", at: sy.at });
	return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides };
}

/** All keyframe times in a layer, sorted and unique. */
export function keyframeTimes(layer: Layer): number[] {
	const times = new Set<number>();
	for (const prop of ANIMATABLE) for (const k of layer.keyframes[prop] ?? []) times.add(k.t);
	return [...times].sort((a, b) => a - b);
}

export type PlaybackMode = "loop" | "once" | "bounce";

export interface PlaybackSettings {
	mode: PlaybackMode;
	reverse: boolean;
	speed: number;
}

export const DEFAULT_PLAYBACK: PlaybackSettings = { mode: "loop", reverse: false, speed: 1 };

/**
 * The animation time shown `elapsed` seconds after playback starts, for a
 * loop, a single play (holds the last frame) or a bounce (forwards then
 * backwards), optionally reversed and sped up.
 */
export function playbackTime({
	elapsed,
	duration,
	settings,
}: {
	elapsed: number;
	duration: number;
	settings: PlaybackSettings;
}): { t: number; done: boolean } {
	if (duration <= 0) return { t: 0, done: true };
	const run = Math.max(0, elapsed * settings.speed);
	let t: number;
	let done = false;
	if (settings.mode === "once") {
		t = Math.min(run, duration);
		done = run >= duration;
	} else if (settings.mode === "bounce") {
		const phase = run % (duration * 2);
		t = phase <= duration ? phase : duration * 2 - phase;
	} else t = run % duration;
	return { t: settings.reverse ? duration - t : t, done };
}

export interface KeyRef {
	layerId: string;
	prop: AnimProp;
	t: number;
}

export const sameKey = ({ a, b }: { a: KeyRef; b: KeyRef }) =>
	a.layerId === b.layerId && a.prop === b.prop && Math.abs(a.t - b.t) < 1e-6;

/**
 * Moves keyframes by `dt` seconds (kept inside 0…duration). A moved
 * keyframe replaces one already at its new time. Returns the new layers and
 * the moved keyframes' new references.
 */
export function moveKeyframes({
	layers,
	keys,
	dt,
	duration,
}: {
	layers: Layer[];
	keys: KeyRef[];
	dt: number;
	duration: number;
}): { layers: Layer[]; keys: KeyRef[] } {
	if (!keys.length) return { layers, keys };
	const lo = Math.min(...keys.map((k) => k.t));
	const hi = Math.max(...keys.map((k) => k.t));
	const shift = Math.max(-lo, Math.min(duration - hi, dt));
	const moved: KeyRef[] = [];
	const next = layers.map((layer) => {
		const mine = keys.filter((k) => k.layerId === layer.id);
		if (!mine.length) return layer;
		const keyframes = { ...layer.keyframes };
		for (const prop of ANIMATABLE) {
			const sel = mine.filter((k) => k.prop === prop);
			const list = keyframes[prop];
			if (!sel.length || !list) continue;
			const isSel = (k: Keyframe) => sel.some((s) => Math.abs(s.t - k.t) < 1e-6);
			const shifted = list.filter(isSel).map((k) => ({ ...k, t: Math.round((k.t + shift) * 1e6) / 1e6 }));
			const kept = list.filter((k) => !isSel(k) && !shifted.some((s) => Math.abs(s.t - k.t) < 1e-6));
			keyframes[prop] = [...kept, ...shifted].sort((a, b) => a.t - b.t);
			for (const k of shifted) moved.push({ layerId: layer.id, prop, t: k.t });
		}
		return { ...layer, keyframes };
	});
	return { layers: next, keys: moved };
}

export interface CopiedKey {
	layerId: string;
	prop: AnimProp;
	/** Seconds after the earliest copied keyframe. */
	offset: number;
	v: number;
	ease: Ease;
}

export function copyKeyframes({ layers, keys }: { layers: Layer[]; keys: KeyRef[] }): CopiedKey[] {
	if (!keys.length) return [];
	const start = Math.min(...keys.map((k) => k.t));
	return keys.flatMap((ref) => {
		const layer = layers.find((l) => l.id === ref.layerId);
		const key = layer?.keyframes[ref.prop]?.find((k) => Math.abs(k.t - ref.t) < 1e-6);
		return key ? [{ layerId: ref.layerId, prop: ref.prop, offset: key.t - start, v: key.v, ease: key.ease }] : [];
	});
}

/**
 * Pastes copied keyframes starting at `t`. With `target`, they all go to that
 * layer; otherwise each returns to the layer it came from.
 */
export function pasteKeyframes({
	layers,
	copied,
	t,
	duration,
	target,
}: {
	layers: Layer[];
	copied: CopiedKey[];
	t: number;
	duration: number;
	target?: string;
}): { layers: Layer[]; keys: KeyRef[] } {
	const keys: KeyRef[] = [];
	const next = layers.map((layer) => {
		let out = layer;
		for (const c of copied) {
			if ((target ?? c.layerId) !== layer.id) continue;
			const at = Math.min(duration, Math.round((t + c.offset) * 1e6) / 1e6);
			out = setKeyframe({ layer: out, prop: c.prop, t: at, v: c.v, ease: c.ease });
			const list = out.keyframes[c.prop] ?? [];
			out = { ...out, keyframes: { ...out.keyframes, [c.prop]: list.map((k) => (Math.abs(k.t - at) < 1e-6 ? { ...k, ease: c.ease } : k)) } };
			keys.push({ layerId: layer.id, prop: c.prop, t: at });
		}
		return out;
	});
	return { layers: next, keys };
}

/** Sets the easing of keyframes (the curve towards each one's next keyframe). */
export function setKeyEase({ layers, keys, ease }: { layers: Layer[]; keys: KeyRef[]; ease: Ease }): Layer[] {
	return layers.map((layer) => {
		const mine = keys.filter((k) => k.layerId === layer.id);
		if (!mine.length) return layer;
		const keyframes = { ...layer.keyframes };
		for (const prop of ANIMATABLE) {
			const list = keyframes[prop];
			if (!list) continue;
			keyframes[prop] = list.map((k) => (mine.some((m) => m.prop === prop && Math.abs(m.t - k.t) < 1e-6) ? { ...k, ease } : k));
		}
		return { ...layer, keyframes };
	});
}
