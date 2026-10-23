import { arcPoints, EASE, ellipse, fill, group, type Key, path, pathData, rect, smoothLine, stroke, trim } from "../lottie-dsl";
import { type AssetDef, cycle, LINE, PALETTE, popScale, slot, SQUARE } from "./common";

// Callouts point at, circle or mark something in the shot. They draw on,
// hold, and (when not looping) stay on screen until the clip ends.
const base = { category: "callouts", durationSec: 3, ...SQUARE } as const;
const F = 90;
const draw = (start: number, length: number): Key[] => [[start, 0, EASE.out], [start + length, 100]];

export const callouts: AssetDef[] = [
	{
		...base,
		id: "co-arrow-curved",
		name: "Curved arrow",
		description: "A hand-drawn curved arrow sketches itself on, then its head snaps into place.",
		tags: ["arrow", "curved", "point", "look here", "sketch"],
		loop: false,
		colors: [slot("arrow", "Arrow", PALETTE.amber)],
		build: ({ c }) => [
			{ name: "Head", position: [760, 330], rotation: -30, scale: popScale(24, 12, 120), shapes: [path(pathData([[-70, -60], [10, 0], [-70, 60]])), stroke(c("arrow"), LINE.bold)] },
			{ name: "Shaft", position: [0, 0], shapes: [path(pathData([[260, 820, 0, 0, -40, -260], [760, 330, -260, 40, 0, 0]])), trim(0, draw(0, 26)), stroke(c("arrow"), LINE.bold)] },
		],
	},
	{
		...base,
		id: "co-arrow-straight",
		name: "Nudging arrow",
		description: "A bold straight arrow nudges towards its target again and again.",
		tags: ["arrow", "straight", "point", "nudge", "right"],
		loop: true,
		colors: [slot("arrow", "Arrow", PALETTE.white), slot("shadow", "Shadow", PALETTE.ink)],
		build: ({ c }) => {
			const arrow = pathData([[-260, -40], [60, -40], [60, -120], [260, 0], [60, 120], [60, 40], [-260, 40]], true);
			const nudge = cycle([[520, 540], [590, 540], [520, 540], [590, 540]], F, EASE.inOut);
			return [
				{ name: "Arrow", position: nudge, shapes: [path(arrow), fill(c("arrow")), stroke(c("arrow"), 18, { join: "round" })] },
				{ name: "Shadow", position: nudge.map(([t, v, e]) => [t, [(v as number[])[0] + 12, 556], e] as Key), opacity: 50, shapes: [path(arrow), fill(c("shadow")), stroke(c("shadow"), 18, { join: "round" })] },
			];
		},
	},
	{
		...base,
		id: "co-circle-scribble",
		name: "Circle scribble",
		description: "A loose pen circle scribbles around a subject, overlapping at the end like a real marker.",
		tags: ["circle", "scribble", "highlight", "marker", "hand drawn"],
		loop: false,
		colors: [slot("ink", "Marker", PALETTE.amber)],
		build: ({ c }) => {
			const points: Array<[number, number]> = [];
			for (let i = 0; i <= 26; i++) {
				const a = (-100 + i * 15.5) * (Math.PI / 180);
				const r = 1 + 0.035 * Math.sin(i * 1.3) + i * 0.004;
				points.push([Math.cos(a) * 380 * r, Math.sin(a) * 270 * r - i * 2]);
			}
			return [{ name: "Scribble", position: [540, 540], rotation: -6, shapes: [path(smoothLine(points)), trim(0, draw(0, 30)), stroke(c("ink"), LINE.regular)] }];
		},
	},
	{
		...base,
		id: "co-underline",
		name: "Swoosh underline",
		description: "A brush-like swoosh underlines a word, with a second shorter stroke.",
		tags: ["underline", "swoosh", "emphasis", "stroke", "mark"],
		loop: false,
		colors: [slot("main", "Main stroke", PALETTE.teal), slot("second", "Second stroke", PALETTE.blue)],
		build: ({ c }) => [
			{ name: "Main", position: [540, 560], shapes: [path(smoothLine([[-400, 20], [-150, -10], [120, 0], [400, -30]])), trim(0, draw(0, 18)), stroke(c("main"), LINE.bold)] },
			{ name: "Second", position: [540, 620], shapes: [path(smoothLine([[-260, 10], [0, -6], [260, 0]])), trim(0, draw(10, 16)), stroke(c("second"), LINE.regular)] },
		],
	},
	{
		...base,
		id: "co-highlight-swipe",
		name: "Highlight swipe",
		description: "A translucent highlighter band swipes across from left to right.",
		tags: ["highlight", "highlighter", "marker", "swipe", "emphasis"],
		loop: false,
		colors: [slot("band", "Band", PALETTE.amber)],
		build: ({ c }) => [
			{ name: "Band", position: [140, 540], rotation: -2, scale: [[0, [0, 100], EASE.out], [20, [100, 100]]], shapes: [rect([800, 150], [400, 0], 18), fill(c("band"), 55)] },
		],
	},
	{
		...base,
		id: "co-brackets",
		name: "Focus brackets",
		description: "Square brackets close in from both sides to frame the subject, then breathe.",
		tags: ["brackets", "focus", "frame", "target", "select"],
		loop: true,
		colors: [slot("bracket", "Brackets", PALETTE.white)],
		build: ({ c }) => {
			const bracket = (side: 1 | -1) => pathData([[side * 60, -260], [0, -260], [0, 260], [side * 60, 260]]);
			const move = (side: 1 | -1): Key[] => [[0, [540 - side * 520, 540], EASE.out], [16, [540 - side * 340, 540], EASE.soft], [53, [540 - side * 360, 540], EASE.soft], [F, [540 - side * 340, 540]]];
			return [
				{ name: "Left", position: move(1), shapes: [path(bracket(1)), stroke(c("bracket"), LINE.bold, { join: "miter", cap: "square" })], opacity: [[0, 0, EASE.out], [8, 100]] },
				{ name: "Right", position: move(-1), shapes: [path(bracket(-1)), stroke(c("bracket"), LINE.bold, { join: "miter", cap: "square" })], opacity: [[0, 0, EASE.out], [8, 100]] },
			];
		},
	},
	{
		...base,
		id: "co-spotlight",
		name: "Spotlight",
		description: "The frame dims around a circle of light that settles on the subject.",
		tags: ["spotlight", "focus", "vignette", "dim", "reveal"],
		loop: false,
		thumbAt: 0.6,
		colors: [slot("dim", "Dim", PALETTE.ink), slot("rim", "Rim", PALETTE.white)],
		build: ({ c }) => [
			{ name: "Rim", position: [[0, [420, 470], EASE.inOut], [30, [560, 520]], [F, [560, 520]]], scale: [[0, [160, 160], EASE.out], [30, [100, 100]]], shapes: [ellipse([440, 440]), stroke(c("rim"), 6, { opacity: 70 })] },
			{
				name: "Dim",
				position: [[0, [420, 470], EASE.inOut], [30, [560, 520]], [F, [560, 520]]],
				scale: [[0, [160, 160], EASE.out], [30, [100, 100]]],
				opacity: [[0, 0, EASE.out], [14, 100]],
				// A ring wide enough to cover the frame leaves a clear hole in the middle.
				shapes: [ellipse([2440, 2440]), stroke(c("dim"), 2000, { opacity: 72, cap: "butt" })],
			},
		],
	},
	{
		...base,
		id: "co-exclamation",
		name: "Exclamation badge",
		description: "A round warning badge pops in and gives a quick shake every loop.",
		tags: ["exclamation", "warning", "attention", "alert", "important"],
		loop: true,
		colors: [slot("badge", "Badge", PALETTE.amber), slot("mark", "Mark", PALETTE.ink)],
		build: ({ c }) => [
			{ name: "Mark", position: [540, 540], rotation: [[0, 0], [40, 0, EASE.inOut], [46, -12], [52, 10], [58, -6], [64, 0], [F, 0]], shapes: [group([rect([48, 170], [0, -40], 24), fill(c("mark"))]), group([ellipse([52, 52], [0, 100]), fill(c("mark"))])] },
			{ name: "Badge", position: [540, 540], rotation: [[0, 0], [40, 0, EASE.inOut], [46, -12], [52, 10], [58, -6], [64, 0], [F, 0]], scale: [[0, [100, 100]], [36, [100, 100], EASE.out], [42, [110, 110], EASE.inOut], [56, [100, 100]], [F, [100, 100]]], shapes: [ellipse([400, 400]), fill(c("badge"))] },
		],
	},
	{
		...base,
		id: "co-check-stamp",
		name: "Check stamp",
		description: "A circle stamps down and a tick draws itself inside.",
		tags: ["check", "tick", "done", "correct", "yes", "stamp"],
		loop: false,
		colors: [slot("circle", "Circle", PALETTE.teal), slot("mark", "Tick", PALETTE.white)],
		build: ({ c }) => [
			{ name: "Tick", position: [540, 550], shapes: [path(pathData([[-110, 0], [-30, 80], [120, -80]])), trim(0, draw(12, 16)), stroke(c("mark"), LINE.bold + 8)] },
			{ name: "Circle", position: [540, 540], scale: [[0, [220, 220], EASE.in], [10, [92, 92], EASE.out], [18, [100, 100]]], opacity: [[0, 0], [6, 100]], rotation: [[0, -14, EASE.out], [12, 0]], shapes: [ellipse([440, 440]), fill(c("circle"))] },
		],
	},
	{
		...base,
		id: "co-cross-stamp",
		name: "Cross stamp",
		description: "A circle stamps down and a cross strikes through it.",
		tags: ["cross", "x", "wrong", "no", "stamp", "mistake"],
		loop: false,
		colors: [slot("circle", "Circle", PALETTE.ink), slot("mark", "Cross", PALETTE.amber)],
		build: ({ c }) => [
			{ name: "Stroke A", position: [540, 540], shapes: [path(pathData([[-110, -110], [110, 110]])), trim(0, draw(12, 10)), stroke(c("mark"), LINE.bold + 8)] },
			{ name: "Stroke B", position: [540, 540], shapes: [path(pathData([[110, -110], [-110, 110]])), trim(0, draw(18, 10)), stroke(c("mark"), LINE.bold + 8)] },
			{ name: "Circle", position: [540, 540], scale: [[0, [220, 220], EASE.in], [10, [92, 92], EASE.out], [18, [100, 100]]], opacity: [[0, 0], [6, 100]], shapes: [ellipse([440, 440]), fill(c("circle")), group([path(pathData(arcPoints(0, 0, 200, 0, 360))), stroke(c("mark"), LINE.thin)])] },
		],
	},
];
