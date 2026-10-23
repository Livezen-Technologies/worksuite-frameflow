import { EASE, ellipse, fill, group, type Key, path, pathData, rect, stroke, trim } from "../lottie-dsl";
import { type AssetDef, inOut, PALETTE, slot, WIDE } from "./common";

// Lower thirds are 16:9 so they line up with a landscape frame. Each leaves
// clear space on its bars for the user's own title and subtitle.
const T: [number, number, number, number] = [0, 18, 100, 118];
const base = {
	category: "lower-thirds",
	durationSec: 4,
	loop: false,
	...WIDE,
} as const;

export const lowerThirds: AssetDef[] = [
	{
		...base,
		id: "lt-bar-slide",
		name: "Bar slide",
		description: "An accent line grows, then a title bar and a subtitle bar slide out from it.",
		tags: ["lower third", "name", "title", "bar", "slide", "news"],
		colors: [slot("main", "Title bar", PALETTE.blue), slot("sub", "Subtitle bar", PALETTE.ink), slot("accent", "Accent", PALETTE.amber)],
		build: ({ c }) => [
			{ name: "Accent", position: [150, 860], shapes: [rect([14, 168], [0, 0], 7), fill(c("accent"))], scale: inOut([0, 12, 104, 118], [100, 0], [100, 100]) },
			{ name: "Title bar", position: [170, 830], shapes: [rect([760, 104], [380, 0], 6), fill(c("main"))], scale: inOut([4, 22, 98, 114], [0, 100], [100, 100]) },
			{ name: "Subtitle bar", position: [170, 918], shapes: [rect([520, 58], [260, 0], 6), fill(c("sub"), 92)], scale: inOut([9, 27, 96, 110], [0, 100], [100, 100]) },
		],
	},
	{
		...base,
		id: "lt-pill-pop",
		name: "Pill pop",
		description: "A rounded pill pops in with a pulsing dot on its left edge.",
		tags: ["lower third", "pill", "rounded", "pop", "label"],
		colors: [slot("pill", "Pill", PALETTE.white), slot("dot", "Dot", PALETTE.teal), slot("ring", "Ring", PALETTE.blue)],
		build: ({ c }) => [
			{ name: "Ring", position: [230, 870], shapes: [ellipse([78, 78]), stroke(c("ring"), 6)], scale: [[14, [60, 60], EASE.out], [40, [150, 150]], [70, [150, 150]]], opacity: [[14, 0, EASE.out], [20, 100, EASE.out], [40, 0]] },
			{ name: "Dot", position: [230, 870], shapes: [ellipse([56, 56]), fill(c("dot"))], scale: [[6, [0, 0], EASE.back], [20, [100, 100]], [102, [100, 100], EASE.backIn], [116, [0, 0]]] },
			{ name: "Pill", position: [180, 870], shapes: [rect([780, 120], [390, 0], 60), fill(c("pill"))], scale: [[0, [0, 80], EASE.back], [20, [100, 100]], [100, [100, 100], EASE.in], [116, [0, 80]]], opacity: inOut(T, 0, 100) },
		],
	},
	{
		...base,
		id: "lt-double-stack",
		name: "Double stack",
		description: "Two stacked bars drop into place one after the other.",
		tags: ["lower third", "stack", "two lines", "name", "role"],
		colors: [slot("top", "Top bar", PALETTE.teal), slot("bottom", "Bottom bar", PALETTE.white), slot("edge", "Edge", PALETTE.ink)],
		build: ({ c }) => [
			{ name: "Edge", position: inOut([12, 28, 98, 114], [-500, 866], [160, 866]), shapes: [rect([10, 184], [0, 0], 2), fill(c("edge"))], opacity: inOut([12, 20, 106, 114], 0, 100) },
			{ name: "Top", position: inOut([2, 20, 96, 112], [-500, 820], [520, 820]), shapes: [rect([700, 92], [0, 0], 4), fill(c("top"))], opacity: inOut([2, 10, 104, 112], 0, 100) },
			{ name: "Bottom", position: inOut([8, 26, 100, 116], [-500, 912], [480, 912]), shapes: [rect([620, 70], [0, 0], 4), fill(c("bottom"))], opacity: inOut([8, 16, 108, 116], 0, 100) },
		],
	},
	{
		...base,
		id: "lt-corner-brackets",
		name: "Corner brackets",
		description: "Four corner brackets draw themselves around a clear space for a name.",
		tags: ["lower third", "brackets", "frame", "minimal", "outline"],
		colors: [slot("bracket", "Brackets", PALETTE.white), slot("accent", "Accent line", PALETTE.amber)],
		build: ({ c }) => {
			const corner = (x: number, y: number, sx: number, sy: number) =>
				group([path(pathData([[x + 70 * sx, y], [x, y], [x, y + 50 * sy]])), trim(0, [[4, 0, EASE.out], [24, 100], [98, 100, EASE.in], [114, 0]])], {}, "Corner");
			return [
				{ name: "Accent", position: [140, 960], shapes: [path(pathData([[0, 0], [700, 0]])), trim(0, [[14, 0, EASE.out], [36, 100], [96, 100, EASE.in], [110, 0]]), stroke(c("accent"), 8, { cap: "round" })] },
				{
					name: "Brackets",
					position: [0, 0],
					shapes: [group([corner(120, 780, 1, 1), corner(860, 780, -1, 1), corner(120, 930, 1, -1), corner(860, 930, -1, -1), stroke(c("bracket"), 10, { cap: "round", join: "miter" })])],
				},
			];
		},
	},
	{
		...base,
		id: "lt-underline-sweep",
		name: "Underline sweep",
		description: "A long line sweeps across with a travelling dot, then a shorter line follows.",
		tags: ["lower third", "underline", "line", "minimal", "sweep"],
		colors: [slot("line", "Line", PALETTE.white), slot("dot", "Dot", PALETTE.teal), slot("short", "Short line", PALETTE.blue)],
		build: ({ c }) => [
			{ name: "Dot", position: [[0, [140, 900], EASE.out], [22, [940, 900]], [100, [940, 900], EASE.in], [118, [140, 900]]], shapes: [ellipse([26, 26]), fill(c("dot"))], opacity: inOut([0, 4, 112, 118], 0, 100) },
			{ name: "Line", position: [140, 900], shapes: [path(pathData([[0, 0], [800, 0]])), trim(0, inOut(T, 0, 100)), stroke(c("line"), 6)] },
			{ name: "Short", position: [140, 940], shapes: [path(pathData([[0, 0], [380, 0]])), trim(0, inOut([8, 28, 96, 112], 0, 100)), stroke(c("short"), 6)] },
		],
	},
	{
		...base,
		id: "lt-glass-card",
		name: "Glass card",
		description: "A translucent dark card rises with a coloured edge and a soft highlight.",
		tags: ["lower third", "card", "glass", "modern", "panel"],
		colors: [slot("card", "Card", PALETTE.ink), slot("edge", "Edge", PALETTE.teal), slot("shine", "Highlight", PALETTE.white)],
		build: ({ c }) => [
			{ name: "Edge", position: inOut([4, 22, 98, 116], [140, 920], [140, 870]), shapes: [rect([12, 170], [6, 0], 6), fill(c("edge"))], opacity: inOut([4, 14, 104, 116], 0, 100) },
			{ name: "Shine", position: inOut([4, 22, 98, 116], [152, 920], [152, 870]), shapes: [path(pathData([[8, -80], [770, -80]])), trim(0, [[10, 0, EASE.out], [34, 100]]), stroke(c("shine"), 4, { opacity: 45 })], opacity: inOut([4, 14, 104, 116], 0, 100) },
			{ name: "Card", position: inOut([0, 20, 98, 118], [146, 920], [146, 870]), shapes: [rect([780, 170], [390, 0], 10), fill(c("card"), 78)], opacity: inOut(T, 0, 100) },
		],
	},
	{
		...base,
		id: "lt-angled",
		name: "Angled slab",
		description: "A slanted slab slices in with a thin parallel stripe.",
		tags: ["lower third", "angled", "sport", "dynamic", "slant"],
		colors: [slot("slab", "Slab", PALETTE.amber), slot("stripe", "Stripe", PALETTE.ink)],
		build: ({ c }) => {
			const slant = (w: number, h: number) => pathData([[30, -h / 2], [w + 30, -h / 2], [w - 30, h / 2], [-30, h / 2]], true);
			return [
				{ name: "Stripe", position: inOut([6, 24, 98, 114], [-400, 948], [520, 948]), shapes: [path(slant(640, 18)), fill(c("stripe"))] },
				{ name: "Slab", position: inOut([0, 20, 100, 118], [-900, 860], [130, 860]), shapes: [path(slant(820, 130)), fill(c("slab"))] },
			];
		},
	},
	{
		...base,
		id: "lt-dots-line",
		name: "Dots and line",
		description: "Three dots pop in a row, then a line and a bar extend from them.",
		tags: ["lower third", "dots", "line", "playful", "bar"],
		colors: [slot("dot1", "Dot 1", PALETTE.blue), slot("dot2", "Dot 2", PALETTE.teal), slot("dot3", "Dot 3", PALETTE.amber), slot("bar", "Bar", PALETTE.white)],
		build: ({ c }) => {
			const dot = (i: number, color: string) => ({
				name: `Dot ${i + 1}`,
				position: [160 + i * 44, 870],
				shapes: [ellipse([30, 30]), fill(color)],
				scale: [[i * 4, [0, 0], EASE.back], [i * 4 + 12, [100, 100]], [100 + i * 3, [100, 100], EASE.backIn], [110 + i * 3, [0, 0]]] as Key[],
			});
			return [
				dot(0, c("dot1")),
				dot(1, c("dot2")),
				dot(2, c("dot3")),
				{ name: "Bar", position: [270, 870], shapes: [rect([700, 110], [350, 0], 55), fill(c("bar"))], scale: inOut([12, 32, 94, 108], [0, 100], [100, 100]) },
			];
		},
	},
	{
		...base,
		id: "lt-split-reveal",
		name: "Split reveal",
		description: "Two bars rush in from opposite sides and meet to form a title strip.",
		tags: ["lower third", "split", "reveal", "meet", "strip"],
		colors: [slot("left", "Left bar", PALETTE.blue), slot("right", "Right bar", PALETTE.teal), slot("seam", "Seam", PALETTE.white)],
		build: ({ c }) => [
			{ name: "Seam", position: [560, 870], shapes: [rect([8, 130], [0, 0], 4), fill(c("seam"))], scale: inOut([16, 26, 96, 104], [100, 0], [100, 100]) },
			{ name: "Left", position: inOut([0, 18, 100, 118], [-500, 870], [345, 870]), shapes: [rect([430, 110], [0, 0], 4), fill(c("left"))] },
			{ name: "Right", position: inOut([0, 18, 100, 118], [2300, 870], [775, 870]), shapes: [rect([430, 110], [0, 0], 4), fill(c("right"))] },
		],
	},
	{
		...base,
		id: "lt-corner-tag",
		name: "Corner tag",
		description: "A tag with a round badge slides in on the right of the frame.",
		tags: ["lower third", "tag", "right", "badge", "handle"],
		colors: [slot("tag", "Tag", PALETTE.ink), slot("badge", "Badge", PALETTE.amber), slot("icon", "Badge mark", PALETTE.white)],
		build: ({ c }) => [
			{ name: "Mark", position: [1260, 880], shapes: [ellipse([30, 30]), fill(c("icon"))], scale: [[16, [0, 0], EASE.back], [28, [100, 100]], [98, [100, 100], EASE.in], [106, [0, 0]]] },
			{ name: "Badge", position: [1260, 880], shapes: [ellipse([96, 96]), fill(c("badge"))], scale: [[8, [0, 0], EASE.back], [24, [100, 100]], [100, [100, 100], EASE.in], [112, [0, 0]]], rotation: [[8, -90, EASE.out], [24, 0]] },
			{ name: "Tag", position: inOut([0, 20, 100, 118], [2400, 880], [1500, 880]), shapes: [rect([600, 128], [0, 0], 64), fill(c("tag"), 90)] },
		],
	},
];
