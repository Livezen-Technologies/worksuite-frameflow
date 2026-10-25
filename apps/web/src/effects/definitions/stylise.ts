import type { ParamDefinition, ParamValues } from "@/params";
import type { EffectCategory, EffectDefinition } from "@/effects/types";

function num({ params, key }: { params: ParamValues; key: string }): number {
	const value = params[key];
	if (typeof value === "boolean") return value ? 1 : 0;
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
	return Number.isFinite(parsed) ? parsed : 0;
}

function slider({
	key,
	label,
	min,
	max,
	step,
	value,
}: {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
}): ParamDefinition {
	return { key, label, type: "number", default: value, min, max, step };
}

/**
 * A single-pass effect on the engine's shared "stylise" layout
 * (rust/crates/effects/src/shaders): up to eight numbers in u_p0/u_p1.
 */
function stylise({
	type,
	name,
	category,
	keywords,
	params,
	p0,
	p1,
}: {
	type: string;
	name: string;
	category: EffectCategory;
	keywords: string[];
	params: ParamDefinition[];
	p0: (read: (key: string) => number) => number[];
	p1?: (read: (key: string) => number) => number[];
}): EffectDefinition {
	return {
		type,
		name,
		category,
		keywords,
		params,
		renderer: {
			passes: [
				{
					shader: type,
					uniforms: ({ effectParams, time }) => {
						const read = (key: string) => num({ params: effectParams, key });
						const pad = (values: number[]) =>
							[...values, 0, 0, 0, 0].slice(0, 4);
						return {
							u_time: time,
							u_p0: pad(p0(read)),
							...(p1 ? { u_p1: pad(p1(read)) } : {}),
						};
					},
				},
			],
		},
	};
}

const percent = ({
	read,
	key,
}: {
	read: (key: string) => number;
	key: string;
}) => read(key) / 100;

export const DENOISE_EFFECT_TYPE = "denoise";

// Built around the frame's centre or its edges, so they can't wrap round a sphere.
const NOT_SPHERE_SAFE = new Set(["vignette", "mirror", "wave"]);

const STYLISE_LIST: EffectDefinition[] = [
	stylise({
		type: DENOISE_EFFECT_TYPE,
		name: "Reduce noise",
		category: "Blur",
		keywords: ["denoise", "noise", "grain", "clean", "smooth"],
		params: [
			slider({
				key: "strength",
				label: "Strength",
				min: 0,
				max: 100,
				step: 1,
				value: 50,
			}),
		],
		p0: (r) => [percent({ read: r, key: "strength" })],
	}),
	stylise({
		type: "sharpen",
		name: "Sharpen",
		category: "Blur",
		keywords: ["sharp", "detail", "crisp"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 200,
				step: 1,
				value: 50,
			}),
		],
		p0: (r) => [r("amount") / 100],
	}),
	stylise({
		type: "vignette",
		name: "Vignette",
		category: "Stylise",
		keywords: ["dark", "edges", "corners", "frame"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 100,
				step: 1,
				value: 60,
			}),
			slider({
				key: "size",
				label: "Size",
				min: 0,
				max: 100,
				step: 1,
				value: 50,
			}),
			slider({
				key: "softness",
				label: "Softness",
				min: 0,
				max: 100,
				step: 1,
				value: 50,
			}),
		],
		p0: (r) => [
			percent({ read: r, key: "amount" }),
			percent({ read: r, key: "size" }),
			percent({ read: r, key: "softness" }),
		],
	}),
	stylise({
		type: "posterize",
		name: "Posterize",
		category: "Stylise",
		keywords: ["levels", "comic", "flat"],
		params: [
			slider({
				key: "levels",
				label: "Levels",
				min: 2,
				max: 16,
				step: 1,
				value: 5,
			}),
		],
		p0: (r) => [r("levels")],
	}),
	stylise({
		type: "invert",
		name: "Invert",
		category: "Stylise",
		keywords: ["negative", "reverse"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 100,
				step: 1,
				value: 100,
			}),
		],
		p0: (r) => [percent({ read: r, key: "amount" })],
	}),
	stylise({
		type: "edge-detect",
		name: "Edge detect",
		category: "Stylise",
		keywords: ["outline", "sketch", "lines", "sobel"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 100,
				step: 1,
				value: 100,
			}),
			{
				key: "glow",
				label: "White lines on black",
				type: "boolean",
				default: true,
			},
		],
		p0: (r) => [percent({ read: r, key: "amount" }), r("glow")],
	}),
	stylise({
		type: "pixelate",
		name: "Pixelate",
		category: "Distort",
		keywords: ["mosaic", "censor", "blocks", "8-bit"],
		params: [
			slider({
				key: "size",
				label: "Block size",
				min: 1,
				max: 100,
				step: 1,
				value: 16,
			}),
		],
		p0: (r) => [r("size")],
	}),
	stylise({
		type: "mirror",
		name: "Mirror",
		category: "Distort",
		keywords: ["reflect", "kaleidoscope", "symmetry"],
		params: [
			{
				key: "mode",
				label: "Mirror",
				type: "select",
				default: "0",
				options: [
					{ value: "0", label: "Left onto right" },
					{ value: "1", label: "Right onto left" },
					{ value: "2", label: "Top onto bottom" },
					{ value: "3", label: "Bottom onto top" },
					{ value: "4", label: "Four-way" },
				],
			},
		],
		p0: (r) => [r("mode")],
	}),
	stylise({
		type: "wave",
		name: "Wave",
		category: "Distort",
		keywords: ["ripple", "water", "wobble", "heat"],
		params: [
			slider({
				key: "amplitude",
				label: "Amplitude",
				min: 0,
				max: 100,
				step: 1,
				value: 30,
			}),
			slider({
				key: "frequency",
				label: "Frequency",
				min: 1,
				max: 30,
				step: 1,
				value: 6,
			}),
			slider({
				key: "speed",
				label: "Speed",
				min: 0,
				max: 5,
				step: 0.1,
				value: 1,
			}),
			{
				key: "direction",
				label: "Direction",
				type: "select",
				default: "0",
				options: [
					{ value: "0", label: "Horizontal" },
					{ value: "1", label: "Vertical" },
				],
			},
		],
		p0: (r) => [
			percent({ read: r, key: "amplitude" }),
			r("frequency"),
			r("speed"),
			r("direction"),
		],
	}),
	stylise({
		type: "glow",
		name: "Glow",
		category: "Light",
		keywords: ["bloom", "dreamy", "soft light", "shine"],
		params: [
			slider({
				key: "radius",
				label: "Radius",
				min: 1,
				max: 40,
				step: 1,
				value: 18,
			}),
			slider({
				key: "intensity",
				label: "Intensity",
				min: 0,
				max: 200,
				step: 1,
				value: 60,
			}),
			slider({
				key: "threshold",
				label: "Threshold",
				min: 0,
				max: 100,
				step: 1,
				value: 60,
			}),
		],
		p0: (r) => [
			r("radius"),
			r("intensity") / 100,
			percent({ read: r, key: "threshold" }),
		],
	}),
	stylise({
		type: "film-grain",
		name: "Film grain",
		category: "Retro",
		keywords: ["noise", "grain", "film", "texture"],
		params: [
			slider({
				key: "strength",
				label: "Strength",
				min: 0,
				max: 100,
				step: 1,
				value: 25,
			}),
			slider({
				key: "size",
				label: "Size",
				min: 1,
				max: 8,
				step: 0.5,
				value: 1.5,
			}),
			slider({
				key: "color",
				label: "Colour",
				min: 0,
				max: 100,
				step: 1,
				value: 0,
			}),
		],
		p0: (r) => [
			percent({ read: r, key: "strength" }),
			r("size"),
			percent({ read: r, key: "color" }),
		],
	}),
	stylise({
		type: "vhs",
		name: "VHS",
		category: "Retro",
		keywords: ["tape", "analog", "80s", "90s", "glitch", "scanlines"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 100,
				step: 1,
				value: 60,
			}),
			slider({
				key: "scanlines",
				label: "Scanlines",
				min: 0,
				max: 100,
				step: 1,
				value: 50,
			}),
			slider({
				key: "bleed",
				label: "Colour bleed",
				min: 0,
				max: 100,
				step: 1,
				value: 50,
			}),
			slider({
				key: "noise",
				label: "Noise",
				min: 0,
				max: 100,
				step: 1,
				value: 30,
			}),
		],
		p0: (r) => [
			percent({ read: r, key: "amount" }),
			percent({ read: r, key: "scanlines" }),
			percent({ read: r, key: "bleed" }),
			percent({ read: r, key: "noise" }),
		],
	}),
	stylise({
		type: "rgb-split",
		name: "RGB split",
		category: "Retro",
		keywords: ["chromatic aberration", "glitch", "colour fringe"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 100,
				step: 1,
				value: 40,
			}),
			slider({
				key: "angle",
				label: "Angle",
				min: 0,
				max: 360,
				step: 1,
				value: 0,
			}),
		],
		p0: (r) => [percent({ read: r, key: "amount" }), r("angle")],
	}),
	stylise({
		type: "sepia",
		name: "Sepia",
		category: "Retro",
		keywords: ["old", "vintage", "brown", "tone"],
		params: [
			slider({
				key: "amount",
				label: "Amount",
				min: 0,
				max: 100,
				step: 1,
				value: 100,
			}),
		],
		p0: (r) => [percent({ read: r, key: "amount" })],
	}),
];

/** "#00ff00" or "#0f0" → [r, g, b] 0–1; green when unreadable. */
function hexToRgb(value: unknown): [number, number, number] {
	const hex = typeof value === "string" ? value.trim().replace(/^#/, "") : "";
	const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex.slice(0, 6);
	const n = Number.parseInt(full, 16);
	if (full.length !== 6 || !Number.isFinite(n)) return [0, 1, 0];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Green / blue screen: makes the chosen colour transparent (shaders/chroma_key.wgsl). */
export const CHROMA_KEY_EFFECT: EffectDefinition = {
	type: "chroma-key",
	name: "Green screen",
	category: "Color",
	keywords: ["chroma key", "green screen", "blue screen", "key", "remove colour", "background"],
	params: [
		{ key: "color", label: "Key colour", type: "color", default: "#00FF00" },
		slider({ key: "similarity", label: "Strength", min: 0, max: 100, step: 1, value: 40 }),
		slider({ key: "smoothness", label: "Soft edges", min: 0, max: 100, step: 1, value: 20 }),
		slider({ key: "spill", label: "Remove green spill", min: 0, max: 100, step: 1, value: 60 }),
	],
	renderer: {
		passes: [
			{
				shader: "chroma-key",
				uniforms: ({ effectParams, time }) => {
					const read = (key: string) => num({ params: effectParams, key }) / 100;
					const [r, g, b] = hexToRgb(effectParams.color);
					return { u_time: time, u_p0: [r, g, b, read("similarity")], u_p1: [read("smoothness"), read("spill"), 0, 0] };
				},
			},
		],
	},
};

export const STYLISE_EFFECTS: EffectDefinition[] = [...STYLISE_LIST, CHROMA_KEY_EFFECT].map((effect) =>
	NOT_SPHERE_SAFE.has(effect.type) ? { ...effect, sphereSafe: false } : effect,
);
