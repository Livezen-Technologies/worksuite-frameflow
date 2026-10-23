import { arcPoints, EASE, ellipse, fill, group, type Key, type LayerInput, path, pathData, rect, stroke, trim } from "../lottie-dsl";
import { type AssetDef, cycle, LINE, PALETTE, slot, SQUARE } from "./common";

// Status icons and small infographics. 3 s seamless loops (fill, hold, reset).
const base = { category: "status-infographics", durationSec: 3, loop: true, ...SQUARE } as const;
const F = 90;

/** 0 → 100 by `end`, hold, back to 0 at the loop seam. */
const fillUp = (start: number, end: number): Key[] => [[0, 0], [start, 0, EASE.inOut], [end, 100], [F - 10, 100, EASE.in], [F, 0]];

export const status: AssetDef[] = [
	{
		...base,
		id: "st-progress-ring",
		name: "Progress ring",
		description: "A ring fills from empty to full with a dot riding its leading edge.",
		tags: ["progress", "ring", "loading", "percent", "circle"],
		colors: [slot("track", "Track", PALETTE.white), slot("bar", "Progress", PALETTE.teal), slot("dot", "Dot", "#E8FFFC")],
		build: ({ c }) => {
			const progress = fillUp(6, 62);
			return [
				{ name: "Dot", position: [540, 540], rotation: progress.map(([t, v, e]) => [t, ((v as number) / 100) * 360, e] as Key), shapes: [ellipse([56, 56], [0, -280]), fill(c("dot"))], opacity: [[0, 0], [6, 0], [8, 100], [F - 10, 100], [F - 4, 0], [F, 0]] },
				{ name: "Bar", position: [540, 540], shapes: [path(pathData(arcPoints(0, 0, 280, -90, 270))), trim(0, progress), stroke(c("bar"), 44)] },
				{ name: "Track", position: [540, 540], shapes: [ellipse([560, 560]), stroke(c("track"), 44, { opacity: 22 })] },
			];
		},
	},
	{
		...base,
		id: "st-loading-dots",
		name: "Loading dots",
		description: "Three dots bounce and brighten in a wave.",
		tags: ["loading", "dots", "wait", "typing", "busy"],
		colors: [slot("a", "Dot 1", PALETTE.blue), slot("b", "Dot 2", PALETTE.teal), slot("c", "Dot 3", PALETTE.amber)],
		build: ({ c }) =>
			[c("a"), c("b"), c("c")].map((color, i): LayerInput => {
				const x = 340 + i * 200;
				const s = i * 8;
				const hop = (o: number): Key[] => [[o + s, [x, 540], EASE.out], [o + s + 10, [x, 440], EASE.in], [o + s + 20, [x, 540]]];
				return {
					name: `Dot ${i + 1}`,
					position: [[0, [x, 540]], ...hop(0), ...hop(45), [F, [x, 540]]] as Key[],
					scale: [[0, [100, 100]], [s, [100, 100], EASE.out], [s + 10, [116, 116], EASE.in], [s + 20, [100, 100]], [45 + s, [100, 100], EASE.out], [55 + s, [116, 116], EASE.in], [65 + s, [100, 100]], [F, [100, 100]]] as Key[],
					shapes: [ellipse([120, 120]), fill(color)],
				};
			}),
	},
	{
		...base,
		id: "st-battery",
		name: "Battery charging",
		description: "A battery charges cell by cell with a lightning mark, then resets.",
		tags: ["battery", "charging", "power", "energy", "level"],
		colors: [slot("case", "Case", PALETTE.white), slot("cells", "Cells", PALETTE.teal), slot("bolt", "Bolt", PALETTE.amber)],
		build: ({ c }) => [
			{ name: "Bolt", position: [540, 540], scale: cycle([[100, 100], [112, 112], [100, 100], [112, 112], [100, 100], [112, 112]], F), shapes: [path(pathData([[20, -120], [-60, 20], [0, 20], [-20, 120], [60, -20], [0, -20]], true)), fill(c("bolt")), stroke(c("bolt"), 10, { join: "round" })] },
			...[0, 1, 2, 3].map((i): LayerInput => ({
				name: `Cell ${i + 1}`,
				position: [345 + i * 112, 540],
				opacity: [[0, 0], [8 + i * 12, 0, EASE.out], [14 + i * 12, 100], [F - 10, 100, EASE.in], [F - 4, 0], [F, 0]],
				shapes: [rect([92, 190], [0, 0], 14), fill(c("cells"))],
			})),
			{ name: "Case", position: [540, 540], shapes: [group([rect([500, 260], [-20, 0], 36), stroke(c("case"), LINE.regular)]), group([rect([30, 100], [252, 0], 10), fill(c("case"))])] },
		],
	},
	{
		...base,
		id: "st-wifi-bars",
		name: "Signal arcs",
		description: "Signal arcs light up from the dot outward, like a connection being found.",
		tags: ["wifi", "signal", "connection", "network", "online"],
		colors: [slot("on", "Lit", PALETTE.blue), slot("off", "Unlit", PALETTE.white)],
		build: ({ c }) => [
			...[0, 1, 2].map((i): LayerInput => ({
				name: `Arc ${i + 1}`,
				position: [540, 700],
				opacity: [[0, 0], [10 + i * 12, 0, EASE.out], [18 + i * 12, 100], [F - 12, 100, EASE.in], [F - 4, 0], [F, 0]],
				shapes: [path(pathData(arcPoints(0, 0, 150 + i * 120, -135, -45))), stroke(c("on"), 50)],
			})),
			...[0, 1, 2].map((i): LayerInput => ({ name: `Track ${i + 1}`, position: [540, 700], opacity: 22, shapes: [path(pathData(arcPoints(0, 0, 150 + i * 120, -135, -45))), stroke(c("off"), 50)] })),
			{ name: "Dot", position: [540, 700], scale: [[0, [100, 100]], [4, [100, 100], EASE.out], [10, [120, 120], EASE.inOut], [16, [100, 100]], [F, [100, 100]]], shapes: [ellipse([80, 80]), fill(c("on"))] },
		],
	},
	{
		...base,
		id: "st-counter-dial",
		name: "Gauge dial",
		description: "A gauge needle sweeps up with a little overshoot and settles, while the scale fills.",
		tags: ["gauge", "dial", "speed", "meter", "score", "counter"],
		colors: [slot("dial", "Dial", PALETTE.white), slot("fill", "Fill", PALETTE.amber), slot("needle", "Needle", PALETTE.blue)],
		build: ({ c }) => {
			const sweep: Key[] = [[0, -90], [6, -90, EASE.back], [44, 50, EASE.soft], [72, 50, EASE.inOut], [F, -90]];
			return [
				{ name: "Hub", position: [540, 640], shapes: [ellipse([70, 70]), fill(c("needle"))] },
				{ name: "Needle", position: [540, 640], rotation: sweep, shapes: [path(pathData([[-14, 0], [0, -300], [14, 0]], true)), fill(c("needle")), stroke(c("needle"), 10, { join: "round" })] },
				{ name: "Fill", position: [540, 640], shapes: [path(pathData(arcPoints(0, 0, 340, 180, 360))), trim(0, [[0, 0], [6, 0, EASE.back], [44, 78, EASE.soft], [72, 78, EASE.inOut], [F, 0]] as Key[]), stroke(c("fill"), 46, { cap: "butt" })] },
				{ name: "Ticks", position: [540, 640], shapes: [...Array.from({ length: 9 }, (_, i) => group([path(pathData([[0, -260], [0, -230]]))], { rotation: -90 + i * 22.5 })), stroke(c("dial"), 8)] },
				{ name: "Dial", position: [540, 640], shapes: [path(pathData(arcPoints(0, 0, 340, 180, 360))), stroke(c("dial"), 46, { opacity: 25, cap: "butt" })] },
			];
		},
	},
	{
		...base,
		id: "st-bar-chart",
		name: "Growing bar chart",
		description: "Five bars grow in turn on a baseline, with a little bounce, and reset.",
		tags: ["chart", "bar chart", "growth", "stats", "data", "graph"],
		colors: [slot("bars", "Bars", PALETTE.blue), slot("top", "Top bar", PALETTE.teal), slot("base", "Baseline", PALETTE.white)],
		build: ({ c }) => {
			const heights = [220, 330, 270, 420, 520];
			return [
				...heights.map((h, i): LayerInput => ({
					name: `Bar ${i + 1}`,
					position: [260 + i * 140, 800],
					scale: [[0, [100, 0]], [4 + i * 6, [100, 0], EASE.back], [24 + i * 6, [100, 100]], [F - 12, [100, 100], EASE.in], [F - 2, [100, 0]], [F, [100, 0]]],
					shapes: [rect([96, h], [0, -h / 2], 12), fill(i === heights.length - 1 ? c("top") : c("bars"))],
				})),
				{ name: "Baseline", position: [540, 812], shapes: [rect([720, 14], [0, 0], 7), fill(c("base"))] },
			];
		},
	},
	{
		...base,
		id: "st-pie-fill",
		name: "Pie fill",
		description: "A pie chart fills slice by slice around a ring of three colours.",
		tags: ["pie chart", "donut", "share", "percent", "stats", "data"],
		colors: [slot("a", "Slice 1", PALETTE.blue), slot("b", "Slice 2", PALETTE.teal), slot("c", "Slice 3", PALETTE.amber), slot("bg", "Background", PALETTE.white)],
		build: ({ c }) => {
			const slice = (from: number, to: number, start: number, color: string): LayerInput => ({
				name: `Slice ${from}`,
				position: [540, 540],
				shapes: [path(pathData(arcPoints(0, 0, 150, -90 + from * 3.6, -90 + to * 3.6))), trim(0, fillUp(start, start + 18)), stroke(color, 300, { cap: "butt" })],
			});
			return [slice(0, 45, 6, c("a")), slice(45, 75, 24, c("b")), slice(75, 100, 42, c("c")), { name: "Plate", position: [540, 540], opacity: 18, shapes: [ellipse([600, 600]), fill(c("bg"))] }];
		},
	},
	{
		...base,
		id: "st-timeline-dots",
		name: "Timeline steps",
		description: "A line draws across and four milestone dots pop on in sequence.",
		tags: ["timeline", "steps", "milestones", "process", "roadmap"],
		colors: [slot("line", "Line", PALETTE.white), slot("dot", "Dots", PALETTE.amber), slot("ring", "Rings", PALETTE.blue)],
		build: ({ c }) => [
			...[0, 1, 2, 3].flatMap((i): LayerInput[] => {
				const x = 210 + i * 220;
				const s = 6 + i * 12;
				return [
					{ name: `Dot ${i + 1}`, position: [x, 540], scale: [[0, [0, 0]], [s, [0, 0], EASE.back], [s + 10, [100, 100]], [F - 10, [100, 100], EASE.in], [F - 2, [0, 0]], [F, [0, 0]]], shapes: [ellipse([60, 60]), fill(c("dot"))] },
					{ name: `Ring ${i + 1}`, position: [x, 540], scale: [[0, [0, 0]], [s + 2, [0, 0], EASE.out], [s + 14, [100, 100]], [F - 10, [100, 100], EASE.in], [F - 2, [0, 0]], [F, [0, 0]]], shapes: [ellipse([110, 110]), stroke(c("ring"), LINE.thin)] },
				];
			}),
			{ name: "Line", position: [540, 540], shapes: [path(pathData([[-330, 0], [330, 0]])), trim(0, fillUp(4, 46)), stroke(c("line"), LINE.thin)] },
		],
	},
];
