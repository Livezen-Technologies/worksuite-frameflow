import { EASE, ellipse, fill, group, type Key, type LayerInput, path, pathData, rect, stroke } from "../lottie-dsl";
import { type AssetDef, PALETTE, slot, WIDE } from "./common";

// Full-frame wipes on a transparent background: shapes cover the frame by
// the middle (place the cut there) and clear it again by the end.
const base = { category: "transitions", durationSec: 2, loop: false, ...WIDE } as const;
const F = 60;
const MID = 30;

/*
 * Openings are thick strokes whose hole grows: the outer edge stays at
 * OUTER while the path moves out and the stroke thins. The stroke is never
 * wider than the path, which canvas renderers draw incorrectly.
 */
const OUTER = 1700;
const holeToPath = (hole: number) => (hole + OUTER) / 2;
const diamondOf = (r: number) => pathData([[0, -r], [r, 0], [0, r], [-r, 0]], true);

/** A covering ring that opens from the centre over the second half. */
function ring(color: string) {
	return [
		ellipse([[MID, [holeToPath(0) * 2, holeToPath(0) * 2], EASE.inOut], [F - 2, [holeToPath(OUTER) * 2, holeToPath(OUTER) * 2]]] as Key[]),
		stroke(color, [[MID, OUTER, EASE.inOut], [F - 2, 0]] as Key[], { cap: "butt" }),
	];
}

export const transitions: AssetDef[] = [
	{
		...base,
		id: "tr-circle-burst",
		name: "Circle burst",
		description: "A circle bursts out to fill the frame, then opens from the middle to reveal the next shot.",
		tags: ["transition", "circle", "burst", "iris", "wipe"],
		colors: [slot("fill", "Fill", PALETTE.blue), slot("edge", "Edge", PALETTE.teal)],
		build: ({ c }) => [
			{ name: "Edge", position: [960, 540], scale: [[0, [0, 0], EASE.in], [MID - 4, [100, 100]], [F, [100, 100]]], opacity: [[0, 100], [MID, 100], [MID + 1, 0]], shapes: [ellipse([2400, 2400]), fill(c("edge"))] },
			{ name: "Cover", position: [960, 540], scale: [[0, [0, 0]], [4, [0, 0], EASE.in], [MID, [100, 100]], [F, [100, 100]]], opacity: [[0, 100], [MID, 100], [MID + 1, 0]], shapes: [ellipse([2300, 2300]), fill(c("fill"))] },
			// Opening: a ring whose hole grows until it leaves the frame.
			{ name: "Open", position: [960, 540], inPoint: MID, shapes: ring(c("fill")) },
		],
	},
	{
		...base,
		id: "tr-slide-panels",
		name: "Slide panels",
		description: "Three coloured panels sweep across one after another and slide away.",
		tags: ["transition", "slide", "panels", "swipe", "layers"],
		colors: [slot("a", "Panel 1", PALETTE.amber), slot("b", "Panel 2", PALETTE.teal), slot("c", "Panel 3", PALETTE.blue)],
		build: ({ c }) =>
			[c("c"), c("b"), c("a")].map((color, idx): LayerInput => {
				const i = 2 - idx;
				return {
					name: `Panel ${i + 1}`,
					position: [[0, [-1000, 540]], [i * 4, [-1000, 540], EASE.inOut], [MID - 4 + i * 2, [960, 540]], [MID + 2 + i * 3, [960, 540], EASE.inOut], [F - 6 + i * 2, [2920, 540]]] as Key[],
					shapes: [rect([1940, 1100]), fill(color)],
				};
			}),
	},
	{
		...base,
		id: "tr-diagonal-wipe",
		name: "Diagonal wipe",
		description: "A slanted band sweeps across corner to corner with a contrasting leading edge.",
		tags: ["transition", "diagonal", "wipe", "slant", "sweep"],
		colors: [slot("band", "Band", PALETTE.ink), slot("edge", "Edge", PALETTE.amber)],
		build: ({ c }) => {
			const move: Key[] = [[0, [-1900, 540], EASE.inOut], [MID, [960, 540]], [MID + 2, [960, 540], EASE.inOut], [F, [3820, 540]]];
			return [
				{ name: "Edge", position: move.map(([t, v, e]) => [t, [(v as number[])[0] + 180, 540], e] as Key), rotation: 20, shapes: [rect([120, 2600]), fill(c("edge"))], opacity: [[0, 100], [MID - 4, 100], [MID + 4, 100], [F, 100]] },
				{ name: "Band", position: move, rotation: 20, shapes: [rect([3000, 2600]), fill(c("band"))] },
			];
		},
	},
	{
		...base,
		id: "tr-vertical-bars",
		name: "Vertical bars",
		description: "Vertical bars grow down in a ripple to cover the frame, then shrink away upwards.",
		tags: ["transition", "bars", "stripes", "ripple", "columns"],
		colors: [slot("a", "Bars 1", PALETTE.blue), slot("b", "Bars 2", PALETTE.white)],
		build: ({ c }) =>
			Array.from({ length: 8 }, (_, i): LayerInput => {
				const x = 120 + i * 240;
				const d = i * 2;
				return {
					name: `Bar ${i + 1}`,
					position: [[0, [x, 0]], [MID, [x, 0]], [MID + 1, [x, 1080]], [F, [x, 1080]]] as Key[],
					scale: [[0, [100, 0]], [d, [100, 0], EASE.inOut], [MID - 14 + d, [100, 100]], [MID + d, [100, 100], EASE.inOut], [F - 14 + d, [100, 0]]] as Key[],
					shapes: [group([rect([244, 1080], [0, 540]), fill(i % 2 === 0 ? c("a") : c("b"))], { position: [[0, [0, 0]], [MID, [0, 0]], [MID + 1, [0, -1080]], [F, [0, -1080]]] as Key[] })],
				};
			}),
	},
	{
		...base,
		id: "tr-diamond-zoom",
		name: "Diamond zoom",
		description: "A turning diamond zooms in to fill the frame, then a diamond-shaped window opens through it.",
		tags: ["transition", "diamond", "zoom", "rotate", "iris"],
		colors: [slot("fill", "Fill", PALETTE.teal), slot("line", "Outline", PALETTE.white)],
		build: ({ c }) => {
			// A 200 px diamond; layer scale is in percent.
			const diamond = pathData([[0, -100], [100, 0], [0, 100], [-100, 0]], true);
			return [
				{ name: "Line", position: [960, 540], rotation: [[0, 0, EASE.in], [MID, 90]], scale: [[0, [0, 0], EASE.in], [MID - 2, [2300, 2300]]], opacity: [[0, 100], [MID - 2, 100], [MID, 0]], shapes: [path(diamond), stroke(c("line"), 2, { join: "miter" })] },
				{ name: "Cover", position: [960, 540], rotation: [[0, 0, EASE.in], [MID, 90]], scale: [[0, [0, 0], EASE.in], [MID, [2200, 2200]]], opacity: [[0, 100], [MID, 100], [MID + 1, 0]], shapes: [path(diamond), fill(c("fill"))] },
				{ name: "Open", position: [960, 540], inPoint: MID, rotation: [[MID, 0, EASE.out], [F, 45]], scale: [[MID, [100, 100]]], shapes: [path([[MID, diamondOf(holeToPath(0)), EASE.inOut], [F - 2, diamondOf(holeToPath(OUTER))]]), stroke(c("fill"), [[MID, OUTER, EASE.inOut], [F - 2, 0]] as Key[], { join: "miter", cap: "butt" })] },
			];
		},
	},
	{
		...base,
		id: "tr-split-doors",
		name: "Split doors",
		description: "Two halves slide shut like doors with a bright seam, then slide open.",
		tags: ["transition", "doors", "split", "close", "open"],
		colors: [slot("left", "Left door", PALETTE.ink), slot("right", "Right door", "#1B2030"), slot("seam", "Seam", PALETTE.amber)],
		build: ({ c }) => [
			{ name: "Seam", position: [960, 540], scale: [[0, [100, 0]], [MID - 6, [100, 0], EASE.out], [MID, [100, 100]], [MID + 4, [100, 100], EASE.in], [MID + 10, [100, 0]]], shapes: [rect([16, 1080]), fill(c("seam"))] },
			{ name: "Left", position: [[0, [-480, 540], EASE.inOut], [MID - 2, [480, 540]], [MID + 4, [480, 540], EASE.inOut], [F, [-480, 540]]], shapes: [rect([960, 1100]), fill(c("left"))] },
			{ name: "Right", position: [[0, [2400, 540], EASE.inOut], [MID - 2, [1440, 540]], [MID + 4, [1440, 540], EASE.inOut], [F, [2400, 540]]], shapes: [rect([960, 1100]), fill(c("right"))] },
		],
	},
	{
		...base,
		id: "tr-diagonal-stripes",
		name: "Diagonal stripes",
		description: "Slanted stripes slide in from alternating sides to cover the frame, then slide on through.",
		tags: ["transition", "stripes", "diagonal", "interleave", "dynamic"],
		colors: [slot("a", "Stripes 1", PALETTE.amber), slot("b", "Stripes 2", PALETTE.blue)],
		build: ({ c }) =>
			Array.from({ length: 7 }, (_, i): LayerInput => {
				const dir = i % 2 === 0 ? 1 : -1;
				const y = -300 + i * 290;
				return {
					name: `Stripe ${i + 1}`,
					rotation: -25,
					position: [[0, [960 - dir * 3200, y]], [i * 2, [960 - dir * 3200, y], EASE.inOut], [MID - 2, [960, y]], [MID + 2, [960, y], EASE.inOut], [F - 12 + i * 2, [960 + dir * 3200, y]]] as Key[],
					shapes: [rect([3400, 300]), fill(i % 2 === 0 ? c("a") : c("b"))],
				};
			}),
	},
	{
		...base,
		id: "tr-blinds",
		name: "Blinds",
		description: "Horizontal slats close like window blinds, then open again.",
		tags: ["transition", "blinds", "slats", "horizontal", "shutter"],
		colors: [slot("slat", "Slats", PALETTE.white), slot("shade", "Shade", PALETTE.teal)],
		build: ({ c }) =>
			Array.from({ length: 9 }, (_, i): LayerInput => ({
				name: `Slat ${i + 1}`,
				position: [960, 60 + i * 120],
				scale: [[0, [100, 0]], [i, [100, 0], EASE.inOut], [MID - 8 + i, [100, 100]], [MID + i, [100, 100], EASE.inOut], [F - 10 + i, [100, 0]]] as Key[],
				shapes: [group([rect([1920, 60], [0, -30]), fill(c("shade"))]), group([rect([1920, 62], [0, 30]), fill(c("slat"))])],
			})),
	},
];
