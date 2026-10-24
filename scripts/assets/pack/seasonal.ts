import { arcPoints, EASE, ellipse, fill, group, type Key, type LayerInput, path, pathData, rect, star, stroke } from "../lottie-dsl";
import { type AssetDef, cycle, LINE, PALETTE, slot, SQUARE } from "./common";
import { flamePath } from "./reactions";

// Original motifs for Sri Lankan festivals and holidays. 4 s seamless loops.
const base = { category: "sri-lanka-seasonal", durationSec: 4, loop: true, ...SQUARE } as const;
const F = 120;

/** A small flickering flame for lamps. */
const lampFlame = (name: string, x: number, y: number, size: number, outer: string, inner: string, phase = 0): LayerInput => ({
	name,
	position: [x, y],
	anchor: [0, 92],
	scale: cycle(
		[[1, 1], [0.92, 1.1], [1.05, 0.96], [0.96, 1.06], [1, 1], [0.94, 1.08], [1.04, 0.97], [0.97, 1.04]]
			.map((_, i, all) => all[(i + phase) % all.length])
			.map(([x, y]) => [size * x, size * y]),
		F,
		EASE.soft,
	),
	shapes: [group([path(flamePath), fill(inner)], { scale: [55, 55], position: [0, 40] }), group([path(flamePath), fill(outer)])],
});

/**
 * Crescent: the part of a circle (radius r, at the origin) outside a second
 * circle (radius innerR, at dx,dy). Outer arc the long way, inner arc back.
 */
function crescent(r: number, innerR: number, dx: number, dy: number) {
	const d = Math.hypot(dx, dy);
	const a = (r * r - innerR * innerR + d * d) / (2 * d);
	const h = Math.sqrt(r * r - a * a);
	const mx = (a * dx) / d;
	const my = (a * dy) / d;
	const p1: [number, number] = [mx + (h * dy) / d, my - (h * dx) / d];
	const p2: [number, number] = [mx - (h * dy) / d, my + (h * dx) / d];
	const angle = (p: [number, number], cx: number, cy: number) => (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI;
	/** The arc from `from` to `to` around (cx,cy) whose middle satisfies `keep`. */
	const pickArc = (cx: number, cy: number, radius: number, from: [number, number], to: [number, number], keep: (x: number, y: number) => boolean) => {
		const start = angle(from, cx, cy);
		let end = angle(to, cx, cy);
		while (end <= start) end += 360;
		const mid = (((start + end) / 2) * Math.PI) / 180;
		if (!keep(cx + Math.cos(mid) * radius, cy + Math.sin(mid) * radius)) end -= 360;
		return arcPoints(cx, cy, radius, start, end);
	};
	const outer = pickArc(0, 0, r, p1, p2, (x, y) => Math.hypot(x - dx, y - dy) > innerR);
	const inner = pickArc(dx, dy, innerR, p2, p1, (x, y) => Math.hypot(x, y) < r);
	// Join the arcs: each shared corner takes its in-tangent from one arc and its out-tangent from the other.
	const o = outer.map((p) => [...p] as [number, number, number, number, number, number]);
	const n = inner.map((p) => [...p] as [number, number, number, number, number, number]);
	o[o.length - 1][4] = n[0][4];
	o[o.length - 1][5] = n[0][5];
	o[0][2] = n[n.length - 1][2];
	o[0][3] = n[n.length - 1][3];
	return pathData([...o, ...n.slice(1, -1)], true);
}

export const seasonal: AssetDef[] = [
	{
		...base,
		id: "sl-avurudu-sun",
		name: "New Year sun and lamp",
		description: "For Sinhala and Tamil New Year: a rising sun with turning rays above a lit oil lamp.",
		tags: ["avurudu", "aluth avurudu", "puthandu", "new year", "april", "sun", "oil lamp", "sri lanka"],
		colors: [slot("sun", "Sun", PALETTE.amber), slot("rays", "Rays", "#FFD166"), slot("lamp", "Lamp", "#C9822B"), slot("flame", "Flame", "#FF6B3D"), slot("core", "Flame core", PALETTE.white)],
		build: ({ c }) => [
			lampFlame("Flame", 540, 760, 50, c("flame"), c("core")),
			{
				name: "Lamp",
				position: [540, 880],
				shapes: [
					group([path(pathData([[-150, -60], [150, -60], [0, 20, 110, 0, -110, 0]], true)), fill(c("lamp"))]),
					group([ellipse([310, 36], [0, -62]), fill(c("rays"))]),
					group([rect([36, 120], [0, 70], 6), fill(c("lamp"))]),
					group([rect([220, 30], [0, 135], 15), fill(c("lamp"))]),
				],
			},
			{
				name: "Rays",
				position: [540, 420],
				rotation: [[0, 0, EASE.linear], [F, 30]],
				shapes: Array.from({ length: 12 }, (_, i) => group([rect([26, 90], [0, -250], 13), fill(c("rays"))], { rotation: i * 30 })),
				scale: cycle([[100, 100], [106, 106]], F, EASE.soft),
			},
			{ name: "Sun", position: [540, 420], scale: cycle([[100, 100], [104, 104]], F, EASE.soft), shapes: [ellipse([300, 300]), fill(c("sun"))] },
		],
	},
	{
		...base,
		id: "sl-vesak-lantern",
		name: "Vesak lantern",
		description: "An original geometric Vesak lantern that sways gently, its tassels swinging and its centre glowing.",
		tags: ["vesak", "lantern", "kuudu", "wesak", "buddhist", "poya", "sri lanka"],
		colors: [slot("frame", "Frame", PALETTE.amber), slot("panel", "Panels", PALETTE.teal), slot("glow", "Glow", "#FFE7A3"), slot("tassel", "Tassels", PALETTE.white), slot("accent", "Accent", PALETTE.blue)],
		build: ({ c }) => {
			const diamond = (x: number, y: number, w: number, h: number) => path(pathData([[x, y - h], [x + w, y], [x, y + h], [x - w, y]], true));
			const sway: Key[] = cycle([-5, 5], F, EASE.soft);
			const tassels = Array.from({ length: 5 }, (_, i) => group([path(pathData([[(i - 2) * 34, 230], [(i - 2) * 40, 400 - Math.abs(i - 2) * 30]])), stroke(c("tassel"), LINE.thin - 2)], { rotation: 0 }));
			return [
				{ name: "Glow", position: [540, 120], anchor: [0, -400], rotation: sway, scale: cycle([[100, 100], [118, 118], [100, 100], [118, 118]], F), opacity: 45, shapes: [ellipse([220, 220]), fill(c("glow"))] },
				{
					name: "Lantern",
					position: [540, 120],
					anchor: [0, -400],
					rotation: sway,
					shapes: [
						group([path(pathData([[0, -400], [0, -280]])), stroke(c("tassel"), 6)]),
						group([diamond(0, -170, 80, 110), fill(c("accent"))]),
						group([diamond(0, 170, 80, 110), fill(c("accent"))]),
						group([diamond(-180, 0, 110, 80), fill(c("accent"))]),
						group([diamond(180, 0, 110, 80), fill(c("accent"))]),
						group([star({ points: 8, outer: 190, inner: 120, rotation: 22.5 }), fill(c("panel"))]),
						group([star({ points: 8, outer: 190, inner: 120, rotation: 22.5 }), stroke(c("frame"), LINE.thin)]),
						group([star({ points: 8, outer: 110, polygon: true, rotation: 22.5 }), fill(c("glow")), stroke(c("frame"), LINE.thin)]),
						group([diamond(0, -170, 80, 110), diamond(0, 170, 80, 110), diamond(-180, 0, 110, 80), diamond(180, 0, 110, 80), stroke(c("frame"), LINE.thin)]),
						group(tassels, { rotation: [[0, 0], [10, 6, EASE.soft], [40, -6, EASE.soft], [70, 6, EASE.soft], [100, -6, EASE.soft], [F, 0]] as Key[], position: [0, 50], anchor: [0, 230] }),
					],
				},
			];
		},
	},
	{
		...base,
		id: "sl-poson-lights",
		name: "Poson lights",
		description: "Strings of small lamps swing between two points and twinkle in a chasing pattern.",
		tags: ["poson", "lights", "bulbs", "string lights", "decoration", "poya", "sri lanka"],
		colors: [slot("wire", "Wire", PALETTE.white), slot("a", "Lights 1", PALETTE.amber), slot("b", "Lights 2", PALETTE.teal), slot("c", "Lights 3", PALETTE.blue)],
		build: ({ c }) => {
			const strands: Array<[number, number]> = [[360, 140], [640, 120]];
			const colors = [c("a"), c("b"), c("c")];
			const layers: LayerInput[] = [];
			strands.forEach(([y, sag], s) => {
				const at = (t: number) => [100 + 880 * t, y + 4 * sag * t * (1 - t)];
				for (let i = 0; i < 9; i++) {
					const t = (i + 0.5) / 9;
					const [x, py] = at(t);
					const phase = (i + s * 2) % 3;
					layers.push({
						name: `Light ${s}-${i}`,
						position: [x, py + 26],
						opacity: cycle([phase === 0 ? 100 : 35, phase === 1 ? 100 : 35, phase === 2 ? 100 : 35], F, EASE.soft),
						shapes: [group([ellipse([34, 46]), fill(colors[(i + s) % 3])]), group([ellipse([80, 80]), fill(colors[(i + s) % 3], 25)]), group([rect([18, 16], [0, -28], 3), fill(c("wire"))])],
					});
				}
				layers.push({ name: `Wire ${s}`, position: [0, 0], shapes: [path(pathData([[100, y, 0, 0, 293, sag * 1.33], [980, y, -293, sag * 1.33, 0, 0]])), stroke(c("wire"), 5)] });
			});
			return layers;
		},
	},
	{
		...base,
		id: "sl-christmas-star",
		name: "Christmas star",
		description: "A five-point star glows with long turning rays and small twinkles.",
		tags: ["christmas", "star", "nattal", "december", "festive", "sri lanka"],
		colors: [slot("star", "Star", PALETTE.amber), slot("rays", "Rays", PALETTE.white), slot("twinkle", "Twinkles", PALETTE.teal)],
		build: ({ c }) => {
			const ray = (len: number, rot: number) => group([path(pathData([[0, -len], [14, 0], [0, len], [-14, 0]], true))], { rotation: rot });
			return [
				{ name: "Star", position: [540, 540], scale: cycle([[100, 100], [106, 106]], F, EASE.soft), shapes: [star({ points: 5, outer: 190, inner: 80, outerRound: 6 }), fill(c("star")), stroke(c("star"), 16, { join: "round" })] },
				{ name: "Rays", position: [540, 540], rotation: [[0, 0, EASE.linear], [F, 45]], opacity: cycle([70, 100], F, EASE.soft), shapes: [ray(420, 0), ray(420, 90), ray(300, 45), ray(300, 135), fill(c("rays"))] },
				...[[260, 260, 0], [820, 280, 40], [800, 820, 80], [280, 800, 20]].map(([x, y, s], i): LayerInput => ({
					name: `Twinkle ${i + 1}`,
					position: [x, y],
					scale: [[0, [0, 0]], [s, [0, 0], EASE.back], [s + 14, [100, 100], EASE.in], [s + 34, [0, 0]], [F, [0, 0]]],
					shapes: [ray(40, 0), ray(40, 90), fill(c("twinkle"))],
				})),
			];
		},
	},
	{
		...base,
		id: "sl-deepavali-lamp",
		name: "Deepavali lamp",
		description: "A clay oil lamp with a dancing flame and a soft warm glow, for Deepavali.",
		tags: ["deepavali", "diwali", "diya", "lamp", "festival of lights", "sri lanka"],
		colors: [slot("lamp", "Lamp", "#C2552B"), slot("pattern", "Pattern", PALETTE.amber), slot("flame", "Flame", "#FF6B3D"), slot("core", "Flame core", PALETTE.white), slot("glow", "Glow", "#FFD166")],
		build: ({ c }) => [
			lampFlame("Flame", 600, 560, 70, c("flame"), c("core")),
			{
				name: "Pattern",
				position: [520, 720],
				shapes: [
					group([...[-120, -60, 0, 60, 120].map((x) => ellipse([26, 26], [x, 30])), fill(c("pattern"))]),
					group([path(pathData([[-200, -10, 0, 0, 100, 40], [200, -10, -100, 40, 0, 0]])), stroke(c("pattern"), LINE.thin)]),
				],
			},
			{
				name: "Lamp",
				position: [520, 720],
				shapes: [
					group([path(pathData([[-250, -40], [180, -40], [300, -110], [250, 10, 30, -40, -40, 50], [0, 130, 140, 0, -140, 0], [-250, -40, 0, 80, 0, 0]], true)), fill(c("lamp")), stroke(c("lamp"), 14, { join: "round" })]),
				],
			},
			{ name: "Glow", position: [600, 520], scale: cycle([[100, 100], [114, 114], [104, 104], [118, 118]], F, EASE.soft), opacity: 28, shapes: [ellipse([420, 420]), fill(c("glow"))] },
		],
	},
	{
		...base,
		id: "sl-crescent-stars",
		name: "Crescent and stars",
		description: "A crescent moon rocks gently while stars twinkle around it, for Ramazan and Hajj.",
		tags: ["ramazan", "ramadan", "eid", "hajj", "crescent", "moon", "stars", "sri lanka"],
		colors: [slot("moon", "Moon", PALETTE.amber), slot("stars", "Stars", PALETTE.white), slot("halo", "Halo", PALETTE.teal)],
		build: ({ c }) => [
			...[[760, 300, 50], [820, 520, 34], [700, 760, 40], [300, 230, 28]].map(([x, y, size], i): LayerInput => ({
				name: `Star ${i + 1}`,
				position: [x, y],
				scale: cycle(i % 2 === 0 ? [[100, 100], [55, 55]] : [[55, 55], [100, 100]], F),
				shapes: [star({ points: 5, outer: size, inner: size * 0.45, outerRound: 4 }), fill(c("stars")), stroke(c("stars"), 6, { join: "round" })],
			})),
			{ name: "Moon", position: [500, 560], rotation: cycle([-8, 6], F, EASE.soft), shapes: [path(crescent(260, 220, 120, -70)), fill(c("moon"))] },
			{ name: "Halo", position: [500, 560], scale: cycle([[100, 100], [108, 108]], F, EASE.soft), opacity: 18, shapes: [ellipse([640, 640]), fill(c("halo"))] },
		],
	},
];
