import { arcPoints, EASE, ellipse, fill, group, type Key, path, pathData, rect, star, stroke, trim } from "../lottie-dsl";
import { type AssetDef, cue, cycle, LINE, PALETTE, slot, SQUARE } from "./common";
import { mouseDevice } from "./pointer";

// Generic, brand-free call-to-action icons. 3 s loops at 1080×1080.
const base = { category: "call-to-action", durationSec: 3, loop: true, ...SQUARE } as const;
const F = 90;

/** Rest → pop to `peak` → settle, then rest until the loop ends. */
const pulse = (start: number, peak = 118): Key[] => [
	[0, [100, 100]],
	[start, [100, 100], EASE.out],
	[start + 6, [peak, peak], EASE.inOut],
	[start + 16, [96, 96], EASE.inOut],
	[start + 24, [100, 100]],
	[F, [100, 100]],
];

const cursorArrow = pathData([[0, 0], [0, 92], [24, 70], [40, 106], [56, 99], [40, 64], [70, 64]], true);

export const callToAction: AssetDef[] = [
	{
		...base,
		id: "cta-subscribe-click",
		name: "Subscribe click",
		description: "A cursor glides to a play-button pill and clicks it; the pill switches to its pressed colour.",
		tags: ["subscribe", "button", "click", "cursor", "pill", "play"],
		colors: [slot("pill", "Pill", PALETTE.blue), slot("pressed", "Pressed pill", PALETTE.ink), slot("icon", "Icon", PALETTE.white), slot("cursor", "Cursor", "#F4F6FA"), slot("outline", "Cursor outline", PALETTE.amber)],
		sounds: [cue("click", 34)],
		build: ({ c }) => [
			{
				name: "Cursor",
				position: [[0, [820, 820], EASE.inOut], [26, [470, 560]], [34, [462, 552], EASE.out], [40, [470, 560]], [70, [470, 560], EASE.inOut], [88, [820, 820]]],
				scale: [[0, [100, 100]], [30, [100, 100], EASE.out], [34, [84, 84], EASE.out], [40, [100, 100]]],
				opacity: [[0, 0, EASE.out], [8, 100], [76, 100, EASE.in], [88, 0]],
				shapes: [path(cursorArrow), fill(c("cursor")), stroke(c("outline"), 6, { join: "round" })],
			},
			{
				name: "Icon",
				position: [370, 540],
				shapes: [
					group([rect([96, 72], [0, 0], 20), fill(c("icon"))]),
					group([path(pathData([[-12, -18], [20, 0], [-12, 18]], true)), fill(c("pill")), stroke(c("pill"), 6, { join: "round" })]),
				],
			},
			{ name: "Pressed", position: [540, 540], shapes: [rect([520, 150], [0, 0], 75), fill(c("pressed"))], opacity: [[0, 0], [34, 0, EASE.out], [40, 100], [70, 100, EASE.in], [80, 0]] },
			{ name: "Pill", position: [540, 540], shapes: [rect([520, 150], [0, 0], 75), fill(c("pill"))], scale: [[0, [100, 100]], [32, [100, 100], EASE.out], [36, [94, 94], EASE.back], [46, [100, 100]], [F, [100, 100]]] },
		],
	},
	{
		...base,
		id: "cta-bell-ring",
		name: "Bell ring",
		description: "A notification bell swings back and forth while sound arcs pulse out.",
		tags: ["bell", "notification", "ring", "alert", "subscribe"],
		colors: [slot("bell", "Bell", PALETTE.amber), slot("clapper", "Clapper", PALETTE.ink), slot("waves", "Sound arcs", PALETTE.white)],
		sounds: [cue("ding", 8, -2)],
		build: ({ c }) => {
			const bell = pathData([[0, -150, -78, 0, 78, 0], [110, -40, 0, -70, 0, 60], [128, 80, -4, -30, 8, 18], [165, 120, 0, -20, 0, 0], [-165, 120, 0, 0, 0, -20], [-128, 80, -8, 18, 4, -30], [-110, -40, 0, 60, 0, -70]], true);
			const arcs = (side: 1 | -1) =>
				[0, 1].map((i) => ({
					name: `Arc ${side}${i}`,
					position: [540, 520],
					shapes: [path(pathData(arcPoints(0, 0, 230 + i * 60, side === 1 ? -35 : 145, side === 1 ? 35 : 215))), stroke(c("waves"), LINE.regular)],
					opacity: [[0, 0], [8 + i * 6, 0, EASE.out], [16 + i * 6, 100, EASE.in], [40 + i * 6, 0], [F, 0]] as Key[],
					scale: [[8 + i * 6, [90, 90], EASE.out], [40 + i * 6, [112, 112]]] as Key[],
				}));
			const swing: Key[] = [[0, 0, EASE.soft], [8, 16], [18, -14], [28, 10], [38, -6], [48, 2], [56, 0], [F, 0]];
			return [
				...arcs(1),
				...arcs(-1),
				{ name: "Clapper", position: [540, 380], anchor: [0, 0], rotation: swing.map(([t, v, e]) => [t + 3, (v as number) * 1.4, e] as Key).concat([[F, 0]]) as Key[], shapes: [ellipse([64, 64], [0, 300]), fill(c("clapper"))] },
				{ name: "Bell", position: [540, 380], anchor: [0, 0], rotation: swing, shapes: [group([path(bell), fill(c("bell"))], { position: [0, 160] }), group([ellipse([44, 44], [0, 0]), fill(c("bell"))])] },
			];
		},
	},
	{
		...base,
		id: "cta-like-thumb",
		name: "Like thumb",
		description: "A thumbs-up pops with a burst of short lines.",
		tags: ["like", "thumbs up", "approve", "pop", "burst"],
		colors: [slot("hand", "Hand", PALETTE.blue), slot("cuff", "Cuff", PALETTE.ink), slot("burst", "Burst", PALETTE.amber)],
		sounds: [cue("pop", 10)],
		build: ({ c }) => {
			const rays = Array.from({ length: 8 }, (_, i) =>
				group([path(pathData([[0, -230], [0, -290]])), trim([[10, 0, EASE.out], [22, 0], [30, 100]] as Key[], [[10, 0, EASE.out], [22, 100]] as Key[]), stroke(c("burst"), LINE.regular)], { rotation: i * 45 }),
			);
			const thumb = pathData([[-40, -30], [-8, -150], [26, -160], [40, -120], [26, -40]], true);
			return [
				{ name: "Burst", position: [540, 540], shapes: rays, opacity: [[0, 0], [9, 0], [10, 100], [30, 100], [31, 0], [F, 0]] },
				{
					name: "Thumb",
					position: [540, 580],
					scale: [[0, [100, 100]], [4, [100, 100], EASE.in], [10, [84, 84], EASE.back], [24, [112, 112], EASE.inOut], [34, [100, 100]], [F, [100, 100]]],
					rotation: [[0, 0], [4, 0, EASE.in], [10, 8, EASE.back], [24, -10, EASE.inOut], [36, 0], [F, 0]],
					shapes: [
						group([rect([60, 190], [-120, 30], 12), fill(c("cuff"))]),
						group([rect([170, 170], [20, 30], 34), fill(c("hand"))]),
						group([path(thumb), fill(c("hand")), stroke(c("hand"), 34, { join: "round" })]),
					],
				},
			];
		},
	},
	{
		...base,
		id: "cta-comment-bubble",
		name: "Comment bubble",
		description: "A speech bubble pops up and three typing dots bounce inside it.",
		tags: ["comment", "chat", "speech bubble", "typing", "reply"],
		colors: [slot("bubble", "Bubble", PALETTE.white), slot("dots", "Dots", PALETTE.blue)],
		build: ({ c }) => [
			...[0, 1, 2].map((i) => ({
				name: `Dot ${i + 1}`,
				position: [[0, [440 + i * 100, 520]], [10 + i * 6, [440 + i * 100, 520], EASE.out], [18 + i * 6, [440 + i * 100, 488], EASE.in], [26 + i * 6, [440 + i * 100, 520]], [45 + i * 6, [440 + i * 100, 520], EASE.out], [53 + i * 6, [440 + i * 100, 488], EASE.in], [61 + i * 6, [440 + i * 100, 520]], [F, [440 + i * 100, 520]]] as Key[],
				shapes: [ellipse([56, 56]), fill(c("dots"))],
			})),
			{
				name: "Bubble",
				position: [540, 540],
				scale: cycle([[100, 100], [104, 96], [100, 100], [97, 103]], F, EASE.soft),
				shapes: [
					group([rect([480, 300], [0, -20], 80), fill(c("bubble"))]),
					group([path(pathData([[-150, 90], [-190, 190], [-50, 110]], true)), fill(c("bubble")), stroke(c("bubble"), 20, { join: "round" })]),
				],
			},
		],
	},
	{
		...base,
		id: "cta-share-arrow",
		name: "Share arrow",
		description: "A curved arrow springs forward from a round button.",
		tags: ["share", "arrow", "forward", "send", "repost"],
		colors: [slot("button", "Button", PALETTE.teal), slot("arrow", "Arrow", PALETTE.white)],
		build: ({ c }) => [
			{
				name: "Arrow",
				position: [[0, [540, 560]], [10, [540, 560], EASE.in], [18, [520, 570], EASE.back], [32, [574, 548], EASE.inOut], [46, [540, 560]], [F, [540, 560]]],
				shapes: [
					group([path(pathData([[-130, 120, 0, 0, 0, -130], [40, -40, -120, 0, 0, 0]])), stroke(c("arrow"), 56, { cap: "round" })]),
					group([path(pathData([[30, -130], [150, -40], [30, 50]], true)), fill(c("arrow")), stroke(c("arrow"), 24, { join: "round" })]),
				],
			},
			{ name: "Button", position: [540, 540], scale: pulse(14, 108), shapes: [ellipse([520, 520]), fill(c("button"))] },
		],
	},
	{
		...base,
		id: "cta-follow-plus",
		name: "Follow plus",
		description: "A round plus button spins in, turns to a tick and back, with a pulse ring.",
		tags: ["follow", "plus", "add", "join", "button"],
		colors: [slot("button", "Button", PALETTE.blue), slot("mark", "Mark", PALETTE.white), slot("ring", "Ring", PALETTE.teal)],
		build: ({ c }) => [
			{
				name: "Plus",
				position: [540, 540],
				rotation: [[0, 0], [20, 0, EASE.back], [36, 180], [F, 180]],
				opacity: [[0, 100], [36, 100, EASE.in], [40, 0], [76, 0, EASE.out], [82, 100], [F, 100]],
				shapes: [group([rect([170, 30], [0, 0], 15), fill(c("mark"))]), group([rect([30, 170], [0, 0], 15), fill(c("mark"))])],
			},
			{
				name: "Tick",
				position: [540, 540],
				shapes: [path(pathData([[-70, 0], [-20, 50], [80, -55]])), trim(0, [[38, 0, EASE.out], [52, 100], [74, 100, EASE.in], [80, 0]] as Key[]), stroke(c("mark"), 32)],
			},
			{ name: "Ring", position: [540, 540], scale: [[0, [100, 100]], [36, [100, 100], EASE.out], [64, [150, 150]], [F, [150, 150]]], opacity: [[0, 0], [36, 0], [37, 100, EASE.out], [64, 0], [F, 0]], shapes: [ellipse([360, 360]), stroke(c("ring"), LINE.regular)] },
			{ name: "Button", position: [540, 540], scale: pulse(34, 112), shapes: [ellipse([360, 360]), fill(c("button"))] },
		],
	},
	{
		...base,
		id: "cta-link-pointer",
		name: "Link pointer",
		description: "A chain-link badge with an arrow bouncing down towards it.",
		tags: ["link in bio", "link", "pointer", "arrow", "down"],
		colors: [slot("badge", "Badge", PALETTE.white), slot("link", "Link", PALETTE.ink), slot("arrow", "Arrow", PALETTE.amber)],
		build: ({ c }) => {
			const loop = (x: number) => group([rect([150, 90], [x, 0], 45), stroke(c("link"), 26)]);
			return [
				{
					name: "Arrow",
					position: cycle([[540, 260], [540, 320], [540, 260], [540, 320]], F, EASE.inOut),
					shapes: [group([path(pathData([[0, -90], [0, 40]])), stroke(c("arrow"), LINE.bold)]), group([path(pathData([[-60, -10], [0, 50], [60, -10]])), stroke(c("arrow"), LINE.bold)])],
				},
				{ name: "Link", position: [540, 640], rotation: -35, shapes: [loop(-55), loop(55)] },
				{ name: "Badge", position: [540, 640], scale: cycle([[100, 100], [104, 104], [100, 100], [104, 104]], F), shapes: [rect([420, 260], [0, 0], 130), fill(c("badge"))] },
			];
		},
	},
	{
		...base,
		id: "cta-swipe-up",
		name: "Swipe up",
		description: "Three chevrons light up in a rising cascade.",
		tags: ["swipe up", "chevron", "arrow", "up", "more"],
		colors: [slot("chevron", "Chevrons", PALETTE.white), slot("glow", "Glow", PALETTE.teal)],
		build: ({ c }) => [
			{ name: "Glow", position: [540, 560], scale: cycle([[100, 100], [112, 112]], F, EASE.soft), opacity: 30, shapes: [ellipse([420, 420]), fill(c("glow"))] },
			...[0, 1, 2].map((i) => {
				const s = i * 10;
				return {
					name: `Chevron ${i + 1}`,
					position: [[0, [540, 700 - i * 110]], [s, [540, 700 - i * 110], EASE.out], [s + 20, [540, 670 - i * 110], EASE.in], [s + 40, [540, 700 - i * 110]], [F, [540, 700 - i * 110]]] as Key[],
					opacity: [[0, 25], [s, 25, EASE.out], [s + 12, 100, EASE.in], [s + 40, 25], [F, 25]] as Key[],
					shapes: [path(pathData([[-110, 50], [0, -50], [110, 50]])), stroke(c("chevron"), LINE.bold + 6)],
				};
			}),
		],
	},
	{
		...base,
		id: "cta-five-star",
		name: "Five-star rating",
		description: "Five stars pop in one after another and fill with colour.",
		tags: ["rate", "rating", "stars", "review", "five stars"],
		colors: [slot("star", "Stars", PALETTE.amber), slot("empty", "Empty stars", PALETTE.white)],
		build: ({ c }) =>
			[0, 1, 2, 3, 4].flatMap((i) => {
				const x = 540 + (i - 2) * 190;
				const start = 6 + i * 7;
				return [
					{
						name: `Star ${i + 1}`,
						position: [x, 540],
						scale: [[0, [0, 0]], [start, [0, 0], EASE.out], [start + 8, [125, 125], EASE.inOut], [start + 14, [100, 100]], [70, [100, 100], EASE.in], [80, [0, 0]], [F, [0, 0]]] as Key[],
						rotation: [[start, -40, EASE.out], [start + 14, 0]] as Key[],
						shapes: [star({ points: 5, outer: 80, inner: 36, outerRound: 8 }), fill(c("star")), stroke(c("star"), 12, { join: "round" })],
					},
					{ name: `Empty ${i + 1}`, position: [x, 540], opacity: 40, shapes: [star({ points: 5, outer: 80, inner: 36 }), stroke(c("empty"), 8, { join: "round" })] },
				];
			}),
	},
	{
		...base,
		id: "cta-mouse-click",
		name: "Mouse click",
		description: "A computer mouse clicks its left button, which presses down and darkens, sending out a click ripple.",
		tags: ["mouse", "click", "computer", "button", "press", "here", "tap"],
		colors: [slot("body", "Mouse", PALETTE.white), slot("outline", "Outline", PALETTE.ink), slot("pressed", "Pressed button", "#AEB6C4"), slot("ripple", "Click ripple", PALETTE.teal)],
		thumbAt: 0.25,
		sounds: [cue("click", 20)],
		build: ({ c }) => mouseDevice({ at: [540, 640], press: 20, body: c("body"), outline: c("outline"), pressed: c("pressed"), ripple: c("ripple") }),
	},
];
