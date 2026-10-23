import { EASE, ellipse, fill, group, type Key, type LayerInput, path, pathData, rect, seeded, stroke, trim } from "../lottie-dsl";
import { type AssetDef, cycle, LINE, PALETTE, slot, SQUARE } from "./common";

// Reactions are 3 s seamless loops.
const base = { category: "reactions", durationSec: 3, loop: true, ...SQUARE } as const;
const F = 90;

export const heartPath = pathData(
	[
		[0, 40, 22, -18, -22, -18],
		[-48, -8, 0, 22, 0, -18],
		[-24, -38, -14, 0, 14, 0],
		[0, -20, -6, -12, 6, -12],
		[24, -38, -14, 0, 14, 0],
		[48, -8, 0, -18, 0, 22],
	],
	true,
);

export const dropPath = pathData(
	[
		[0, -50, -10, 22, 10, 22],
		[30, 15, 0, -22, 0, 18],
		[0, 45, 17, 0, -17, 0],
		[-30, 15, 0, 18, 0, -22],
	],
	true,
);

export const flamePath = pathData(
	[
		[0, -130, -28, 52, 28, 52],
		[64, 30, 0, -52, 0, 40],
		[0, 92, 36, 0, -36, 0],
		[-64, 30, 0, 40, 0, -52],
	],
	true,
);

/** Four-point twinkle star. */
const twinkle = (size: number) =>
	pathData(
		[
			// Each tip's handles point at the centre, so the sides curve inward.
			[0, -size, 0, size * 0.55, 0, size * 0.55],
			[size, 0, -size * 0.55, 0, -size * 0.55, 0],
			[0, size, 0, -size * 0.55, 0, -size * 0.55],
			[-size, 0, size * 0.55, 0, size * 0.55, 0],
		],
		true,
	);

export const reactions: AssetDef[] = [
	{
		...base,
		id: "rx-confetti",
		name: "Confetti burst",
		description: "Confetti bursts from the centre, tumbles and drifts down, then bursts again.",
		tags: ["confetti", "celebrate", "party", "burst", "win"],
		colors: [slot("a", "Confetti 1", PALETTE.blue), slot("b", "Confetti 2", PALETTE.teal), slot("c", "Confetti 3", PALETTE.amber), slot("d", "Confetti 4", PALETTE.white)],
		build: ({ c }) => {
			const rand = seeded(7);
			const colors = [c("a"), c("b"), c("c"), c("d")];
			return Array.from({ length: 28 }, (_, i): LayerInput => {
				const angle = rand() * Math.PI * 2;
				const dist = 220 + rand() * 260;
				const peak = [540 + Math.cos(angle) * dist, 500 + Math.sin(angle) * dist * 0.8 - 120];
				const end = [peak[0] + (rand() - 0.5) * 80, peak[1] + 260 + rand() * 120];
				const shape = i % 3 === 0 ? ellipse([22, 22]) : rect([16 + rand() * 10, 34], [0, 0], 3);
				return {
					name: `Bit ${i + 1}`,
					position: [[0, [540, 540], EASE.out], [20, peak], [80, end, EASE.in], [F, end]] as Key[],
					rotation: [[0, 0, EASE.linear], [F, (rand() > 0.5 ? 1 : -1) * (300 + rand() * 300)]] as Key[],
					scale: [[0, [0, 0], EASE.out], [8, [100, 100]], [F, [100, 100]]] as Key[],
					opacity: [[0, 100], [62, 100, EASE.in], [84, 0], [F, 0]] as Key[],
					shapes: [shape, fill(colors[i % colors.length])],
				};
			});
		},
	},
	{
		...base,
		id: "rx-hearts",
		name: "Floating hearts",
		description: "Hearts float up and sway, fading as they rise, in a steady stream.",
		tags: ["hearts", "love", "like", "float", "romance"],
		colors: [slot("heart", "Hearts", "#FF4D6D"), slot("soft", "Soft hearts", PALETTE.white)],
		build: ({ c }) => {
			const rand = seeded(11);
			return Array.from({ length: 9 }, (_, i): LayerInput => {
				const x = 300 + rand() * 480;
				const offset = Math.round((i * F) / 9);
				const size = 90 + rand() * 90;
				// Each heart rises over one loop, starting at its own offset, wrapping seamlessly.
				const keys = (from: number[], to: number[]): Key[] => {
					const before = F - offset;
					const mid = [from[0] + (to[0] - from[0]) * (before / F), from[1] + (to[1] - from[1]) * (before / F)];
					return offset === 0 ? [[0, from, EASE.linear], [F, to]] : [[0, mid, EASE.linear], [before, to], [before + 0.01, from, EASE.linear], [F, mid]];
				};
				const fade = (t: number) => (t < 0.15 ? t / 0.15 : t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1) * 100;
				const opacityKeys: Key[] = [];
				for (let f = 0; f <= F; f += 6) opacityKeys.push([f, fade(((f + offset) % F) / F), EASE.linear]);
				return {
					name: `Heart ${i + 1}`,
					position: keys([x, 900], [x + (rand() - 0.5) * 160, 160]),
					rotation: cycle([-12, 12], F, EASE.soft, 0),
					scale: [size, size],
					opacity: opacityKeys,
					shapes: [path(heartPath), fill(i % 3 === 2 ? c("soft") : c("heart"))],
				};
			});
		},
	},
	{
		...base,
		id: "rx-sparkles",
		name: "Sparkles",
		description: "Four-point sparkles twinkle in and out at different moments.",
		tags: ["sparkle", "shine", "magic", "twinkle", "new"],
		colors: [slot("main", "Sparkles", PALETTE.amber), slot("alt", "Small sparkles", PALETTE.white)],
		build: ({ c }) => {
			const spots: Array<[number, number, number]> = [[540, 520, 180], [300, 330, 90], [790, 300, 110], [760, 760, 80], [330, 760, 120], [560, 190, 60], [880, 560, 60]];
			return spots.map(([x, y, size], i): LayerInput => {
				const o = i * 9;
				const scale: Key[] = [[0, [0, 0]], [o, [0, 0], EASE.back], [o + 12, [100, 100], EASE.in], [o + 26, [0, 0]], [F, [0, 0]]];
				return { name: `Sparkle ${i + 1}`, position: [x, y], scale, rotation: [[0, 0, EASE.linear], [F, 90]], shapes: [path(twinkle(size)), fill(i === 0 || i % 2 === 1 ? c("main") : c("alt"))] };
			});
		},
	},
	{
		...base,
		id: "rx-fireworks",
		name: "Fireworks",
		description: "Three fireworks burst one after another in radiating streaks.",
		tags: ["fireworks", "celebrate", "new year", "burst", "party"],
		colors: [slot("a", "Burst 1", PALETTE.amber), slot("b", "Burst 2", PALETTE.teal), slot("c", "Burst 3", PALETTE.blue)],
		build: ({ c }) => {
			const bursts: Array<[number, number, number, string]> = [[540, 420, 0, c("a")], [320, 640, 26, c("b")], [770, 660, 52, c("c")]];
			return bursts.map(([x, y, s, color], b): LayerInput => ({
				name: `Burst ${b + 1}`,
				position: [x, y],
				scale: [[0, [60, 60]], [s, [60, 60], EASE.out], [s + 30, [110, 110]], [F, [110, 110]]],
				shapes: [
					group(
						Array.from({ length: 12 }, (_, i) => group([path(pathData([[0, -60], [0, -200]]))], { rotation: i * 30 })).concat([
							trim([[0, 0], [s + 8, 0, EASE.out], [s + 30, 100], [F, 100]] as Key[], [[0, 0], [s, 0, EASE.out], [s + 16, 100], [F, 100]] as Key[]),
							stroke(color, LINE.thin + 4),
						]),
					),
					group([ellipse([36, 36]), fill(color, [[0, 0], [s, 0], [s + 2, 100, EASE.out], [s + 14, 0], [F, 0]] as Key[])]),
				],
			}));
		},
	},
	{
		...base,
		id: "rx-clap-lines",
		name: "Impact lines",
		description: "Comic-style impact lines flash out from a point, like a clap or a hit.",
		tags: ["clap", "impact", "hit", "applause", "pop", "comic"],
		colors: [slot("lines", "Lines", PALETTE.white), slot("accent", "Accent", PALETTE.amber)],
		build: ({ c }) => {
			const lines = (count: number, from: number, to: number, start: number, rotate: number) =>
				group(
					Array.from({ length: count }, (_, i) => group([path(pathData([[0, -from], [0, -to]]))], { rotation: rotate + (i * 360) / count })).concat([
						trim([[0, 0], [start + 10, 0, EASE.in], [start + 24, 100], [F, 100]] as Key[], [[0, 0], [start, 0, EASE.out], [start + 8, 100], [F, 100]] as Key[]),
					]),
				);
			return [
				{ name: "Lines A", position: [540, 540], shapes: [lines(8, 150, 300, 0, 0), stroke(c("lines"), LINE.regular)] },
				{ name: "Lines B", position: [540, 540], shapes: [lines(8, 190, 280, 4, 22.5), stroke(c("accent"), LINE.thin + 4)] },
				{ name: "Lines C", position: [540, 540], shapes: [lines(8, 150, 300, 45, 11), stroke(c("lines"), LINE.regular)] },
				{ name: "Lines D", position: [540, 540], shapes: [lines(8, 190, 280, 49, 33.5), stroke(c("accent"), LINE.thin + 4)] },
			];
		},
	},
	{
		...base,
		id: "rx-fire",
		name: "Fire",
		description: "A flickering flame with layered tongues of colour.",
		tags: ["fire", "flame", "hot", "lit", "trending"],
		colors: [slot("outer", "Outer flame", "#FF6B3D"), slot("middle", "Middle flame", PALETTE.amber), slot("core", "Core", PALETTE.white)],
		build: ({ c }) => {
			const flame = (name: string, color: string, size: number, phase: number): LayerInput => ({
				name,
				position: [540, 640],
				anchor: [0, 92],
				scale: cycle([[size, size], [size * 0.94, size * 1.08], [size * 1.04, size * 0.95], [size * 0.97, size * 1.05], [size * 1.02, size * 0.98], [size * 0.95, size * 1.06]].map((_, i, all) => all[(i + phase) % all.length]) as number[][], F, EASE.soft),
				rotation: cycle([0, 3, -2, 4, -3, 1].map((_, i, all) => all[(i + phase) % all.length]), F, EASE.soft),
				shapes: [path(flamePath), fill(color)],
			});
			return [flame("Core", c("core"), 120, 2), flame("Middle", c("middle"), 200, 1), flame("Outer", c("outer"), 290, 0)];
		},
	},
	{
		...base,
		id: "rx-tears",
		name: "Tears",
		description: "Teardrops well up and fall in two streams.",
		tags: ["tears", "cry", "sad", "emotional", "drops"],
		colors: [slot("drop", "Drops", PALETTE.blue), slot("shine", "Shine", PALETTE.white)],
		build: ({ c }) => {
			const life = 28;
			const stream = (x: number, dir: 1 | -1, offset: number): LayerInput[] =>
				[0, 1, 2].map((i) => {
					const start = offset + i * 25;
					return {
						name: `Drop ${x}-${i}`,
						position: [[0, [x, 360]], [start, [x, 360], EASE.in], [start + life, [x + dir * 120, 860]], [F, [x + dir * 120, 860]]] as Key[],
						scale: [[0, [0, 0]], [start, [0, 0], EASE.back], [start + 6, [100, 100]], [start + life - 4, [100, 100], EASE.in], [start + life, [0, 0]], [F, [0, 0]]] as Key[],
						shapes: [group([group([ellipse([16, 22], [-8, -8]), fill(c("shine"), 80)]), group([path(dropPath), fill(c("drop"))])], { scale: [220, 220] })],
					};
				});
			return [...stream(400, -1, 0), ...stream(680, 1, 12)];
		},
	},
	{
		...base,
		id: "rx-shock-lines",
		name: "Shock lines",
		description: "Jagged lines jolt around the centre for a shocked or surprised moment.",
		tags: ["shock", "surprise", "wow", "omg", "jolt"],
		colors: [slot("lines", "Lines", PALETTE.amber), slot("inner", "Inner lines", PALETTE.white)],
		build: ({ c }) => {
			const zig = (r: number) => pathData([[0, -r], [-14, -r - 40], [12, -r - 70], [-6, -r - 110]]);
			const ring = (count: number, r: number, rotate: number) => Array.from({ length: count }, (_, i) => group([path(zig(r))], { rotation: rotate + (i * 360) / count }));
			const jolt: Key[] = cycle([[100, 100], [112, 112], [96, 96], [108, 108], [100, 100], [104, 104]], F, EASE.out);
			return [
				{ name: "Outer", position: [540, 540], scale: jolt, shapes: [...ring(10, 260, 0), stroke(c("lines"), LINE.regular)] },
				{ name: "Inner", position: [540, 540], scale: cycle([[100, 100], [94, 94], [110, 110], [98, 98], [106, 106], [100, 100]], F, EASE.out), opacity: 80, shapes: [...ring(10, 190, 18), stroke(c("inner"), LINE.thin + 2)] },
			];
		},
	},
];

export { twinkle };
