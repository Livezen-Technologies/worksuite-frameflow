/**
 * Built-in icons (original drawings on a 100×100 grid). Inserting one makes
 * editable path layers, so its points, colours and motion can all change.
 */

import { newId, type Layer, type MotionProject } from "./model";
import { normalizeSubpaths, parsePathData } from "./svg-path";

export interface MotionIcon {
	id: string;
	name: string;
	tags: string[];
	d: string;
	/** Outline icons are drawn with a stroke instead of a fill. */
	stroke?: boolean;
}

function starD({ spikes, inner }: { spikes: number; inner: number }): string {
	const pts: string[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const r = i % 2 ? 46 * inner : 46;
		const a = (Math.PI / spikes) * i - Math.PI / 2;
		pts.push(`${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`);
	}
	return `M${pts.join(" L")} Z`;
}

export const MOTION_ICONS: MotionIcon[] = [
	{ id: "heart", name: "Heart", tags: ["love", "like"], d: "M50 88 C20 66 4 50 4 30 C4 16 15 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C85 6 96 16 96 30 C96 50 80 66 50 88 Z" },
	{ id: "star", name: "Star", tags: ["rating", "favourite"], d: starD({ spikes: 5, inner: 0.42 }) },
	{ id: "burst", name: "Burst", tags: ["sun", "badge", "sale"], d: starD({ spikes: 12, inner: 0.72 }) },
	{ id: "sparkle", name: "Sparkle", tags: ["shine", "magic"], d: starD({ spikes: 4, inner: 0.25 }) },
	{ id: "check", name: "Check", tags: ["done", "tick", "yes"], d: "M14 52 L40 78 L88 24", stroke: true },
	{ id: "cross", name: "Cross", tags: ["close", "no", "x"], d: "M20 20 L80 80 M80 20 L20 80", stroke: true },
	{ id: "plus", name: "Plus", tags: ["add"], d: "M40 6 H60 V40 H94 V60 H60 V94 H40 V60 H6 V40 H40 Z" },
	{ id: "arrow-right", name: "Arrow right", tags: ["next", "direction"], d: "M6 40 H58 V18 L94 50 L58 82 V60 H6 Z" },
	{ id: "arrow-left", name: "Arrow left", tags: ["back", "direction"], d: "M94 40 H42 V18 L6 50 L42 82 V60 H94 Z" },
	{ id: "arrow-up", name: "Arrow up", tags: ["direction"], d: "M40 94 V42 H18 L50 6 L82 42 H60 V94 Z" },
	{ id: "arrow-down", name: "Arrow down", tags: ["direction", "swipe"], d: "M40 6 V58 H18 L50 94 L82 58 H60 V6 Z" },
	{ id: "play", name: "Play", tags: ["video", "start"], d: "M22 10 L86 50 L22 90 Z" },
	{ id: "pause", name: "Pause", tags: ["video", "stop"], d: "M20 10 H42 V90 H20 Z M58 10 H80 V90 H58 Z" },
	{ id: "bell", name: "Bell", tags: ["notification", "subscribe"], d: "M50 8 C30 8 20 24 20 44 V64 L10 76 H90 L80 64 V44 C80 24 70 8 50 8 Z M40 82 H60 C60 90 55 94 50 94 C45 94 40 90 40 82 Z" },
	{ id: "thumb", name: "Thumbs up", tags: ["like", "ok"], d: "M8 44 H26 V92 H8 Z M32 44 L52 8 C60 8 64 14 62 22 L58 38 H88 C94 38 98 44 96 50 L86 86 C84 90 80 92 76 92 H32 Z" },
	{ id: "chat", name: "Chat bubble", tags: ["comment", "message", "speech"], d: "M10 14 H90 V66 H44 L24 86 V66 H10 Z" },
	{ id: "pin", name: "Location pin", tags: ["map", "place"], d: "M50 96 C30 70 16 54 16 36 C16 17 31 4 50 4 C69 4 84 17 84 36 C84 54 70 70 50 96 Z" },
	{ id: "home", name: "Home", tags: ["house"], d: "M50 8 L94 46 H80 V92 H58 V64 H42 V92 H20 V46 H6 Z" },
	{ id: "lightning", name: "Lightning", tags: ["flash", "power", "fast"], d: "M58 4 L16 56 H46 L38 96 L84 40 H54 Z" },
	{ id: "crown", name: "Crown", tags: ["king", "premium", "vip"], d: "M8 30 L30 50 L50 18 L70 50 L92 30 L82 82 H18 Z" },
	{ id: "music", name: "Music note", tags: ["song", "audio"], d: "M36 74 C36 84 28 92 18 92 C8 92 2 86 2 78 C2 68 12 62 22 62 C26 62 30 63 32 65 V12 L92 2 V64 C92 74 84 82 74 82 C64 82 58 76 58 68 C58 58 68 52 78 52 C82 52 86 53 88 55 V18 L36 26 Z" },
	{ id: "search", name: "Search", tags: ["find", "magnifier"], d: "M42 72 A30 30 0 1 1 42 12 A30 30 0 1 1 42 72 Z M64 64 L92 92", stroke: true },
	{ id: "clock", name: "Clock", tags: ["time", "timer"], d: "M50 6 A44 44 0 1 1 50 94 A44 44 0 1 1 50 6 Z M50 24 V50 L68 62", stroke: true },
	{ id: "camera", name: "Camera", tags: ["photo"], d: "M10 28 H30 L38 16 H62 L70 28 H90 V84 H10 Z" },
	{ id: "flag", name: "Flag", tags: ["goal", "finish"], d: "M14 96 V6 H22 V10 H86 L72 32 L86 54 H22 V96 Z" },
];

export function searchIcons({ query }: { query: string }): MotionIcon[] {
	const q = query.trim().toLowerCase();
	return q ? MOTION_ICONS.filter((i) => [i.name, ...i.tags].some((s) => s.toLowerCase().includes(q))) : MOTION_ICONS;
}

/**
 * Path layers for an icon (one per shape), centred on the canvas and sharing
 * an anchor at the icon's centre, so they scale and rotate together.
 */
export function shapesToLayers({
	name,
	subpaths,
	project,
	fill,
	stroke,
	strokeWidth,
	size,
}: {
	name: string;
	subpaths: ReturnType<typeof parsePathData>;
	project: MotionProject;
	fill: string | null;
	stroke: string | null;
	strokeWidth: number;
	size?: number;
}): { layers: Layer[]; groupId?: string } {
	const { paths, width, height } = normalizeSubpaths(subpaths);
	const target = size ?? Math.min(project.width, project.height) / 3;
	const scale = Math.round((target / Math.max(1, width, height)) * 1000) / 1000;
	const groupId = paths.length > 1 ? newId("g") : undefined;
	const layers = paths.map((p, i): Layer => {
		const w = Math.max(1, ...p.points.map((pt) => pt.x));
		const h = Math.max(1, ...p.points.map((pt) => pt.y));
		return {
			id: newId(),
			name: paths.length > 1 ? `${name} ${i + 1}` : name,
			visible: true,
			locked: false,
			groupId,
			x: project.width / 2,
			y: project.height / 2,
			scale,
			rotation: 0,
			opacity: 1,
			anchorX: width / 2 / w,
			anchorY: height / 2 / h,
			keyframes: {},
			kind: "path",
			points: p.points,
			closed: p.closed,
			fill: p.closed ? fill : null,
			stroke: p.closed ? stroke : (stroke ?? fill),
			strokeWidth: p.closed ? strokeWidth : Math.max(strokeWidth, 8 / scale),
		};
	});
	return { layers, groupId };
}

export function iconLayers({ icon, project, color }: { icon: MotionIcon; project: MotionProject; color: string }) {
	const subpaths = parsePathData(icon.d);
	if (icon.stroke) {
		const size = Math.min(project.width, project.height) / 3;
		const scale = size / 100;
		return shapesToLayers({ name: icon.name, subpaths: subpaths.map((s) => ({ ...s, closed: false })), project, fill: null, stroke: color, strokeWidth: 10 / scale });
	}
	return shapesToLayers({ name: icon.name, subpaths, project, fill: color, stroke: null, strokeWidth: 0 });
}

/**
 * Editable shapes from an SVG file: paths, rectangles, circles, ellipses,
 * polygons and lines, with their fill and stroke. Null when the file uses
 * transforms, gradients or text (it's added as a picture then, so it looks right).
 */
export function svgToSubpaths(svgText: string): Array<{ subpaths: ReturnType<typeof parsePathData>; fill: string | null; stroke: string | null; strokeWidth: number }> | null {
	const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
	const root = doc.documentElement;
	if (!root || root.nodeName !== "svg") return null;
	if (root.querySelector("[transform], text, image, linearGradient, radialGradient, pattern, mask, clipPath, use, filter")) return null;
	const attr = ({ el, name }: { el: Element; name: string }): string | null => {
		const styleMatch = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(el.getAttribute("style") ?? "");
		const value = styleMatch?.[1]?.trim() ?? el.getAttribute(name);
		if (value) return value;
		const parent = el.parentElement;
		return parent && parent !== root.parentElement ? attr({ el: parent, name }) : null;
	};
	const n = ({ el, a }: { el: Element; a: string }) => Number(el.getAttribute(a) ?? 0);
	const out: Array<{ subpaths: ReturnType<typeof parsePathData>; fill: string | null; stroke: string | null; strokeWidth: number }> = [];
	for (const el of Array.from(root.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line"))) {
		let d = "";
		switch (el.nodeName) {
			case "path":
				d = el.getAttribute("d") ?? "";
				break;
			case "rect": {
				const [x, y, w, h] = [n({ el, a: "x" }), n({ el, a: "y" }), n({ el, a: "width" }), n({ el, a: "height" })];
				d = `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
				break;
			}
			case "circle":
			case "ellipse": {
				const [cx, cy] = [n({ el, a: "cx" }), n({ el, a: "cy" })];
				const rx = el.nodeName === "circle" ? n({ el, a: "r" }) : n({ el, a: "rx" });
				const ry = el.nodeName === "circle" ? n({ el, a: "r" }) : n({ el, a: "ry" });
				d = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`;
				break;
			}
			case "polygon":
			case "polyline":
				d = `M${(el.getAttribute("points") ?? "").trim()}${el.nodeName === "polygon" ? " Z" : ""}`;
				break;
			case "line":
				d = `M${n({ el, a: "x1" })} ${n({ el, a: "y1" })} L${n({ el, a: "x2" })} ${n({ el, a: "y2" })}`;
				break;
		}
		const subpaths = parsePathData(d);
		if (!subpaths.length) continue;
		const fillRaw = attr({ el, name: "fill" });
		const strokeRaw = attr({ el, name: "stroke" });
		const color = (v: string | null) => (!v || v === "none" || v.startsWith("url(") ? null : v === "currentColor" ? "#FFFFFF" : v);
		out.push({
			subpaths,
			fill: fillRaw === null ? "#000000" : color(fillRaw),
			stroke: color(strokeRaw),
			strokeWidth: Number(attr({ el, name: "stroke-width" }) ?? (strokeRaw ? 1 : 0)) || 0,
		});
	}
	return out.length ? out : null;
}
