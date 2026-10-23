import type { EffectDefinition } from "@/effects/types";
import type { ParamValues } from "@/params";

export const NADIR_EFFECT_TYPE = "nadir";

/** "#rrggbb" to 0–1 channels; anything else is black. */
export function hexToRgb(hex: unknown): [number, number, number] {
	const m = typeof hex === "string" ? /^#?([0-9a-f]{6})$/i.exec(hex.trim()) : null;
	if (!m) return [0, 0, 0];
	const n = Number.parseInt(m[1]!, 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const number = ({ params, key, fallback }: { params: ParamValues; key: string; fallback: number }) => {
	const v = params[key];
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};

/**
 * Nadir patch (SRS VR-19): covers the tripod or selfie stick at the bottom
 * of an equirectangular 360° frame with a blur of the surroundings or a
 * colour. A logo goes on top with Sphere → Add nadir logo.
 */
export const nadirEffectDefinition: EffectDefinition = {
	type: NADIR_EFFECT_TYPE,
	name: "Nadir patch (360°)",
	category: "Distort",
	keywords: ["nadir", "tripod", "selfie stick", "360", "patch", "bottom", "cover"],
	params: [
		{ key: "size", label: "Size (°)", type: "number", default: 20, min: 5, max: 45, step: 1 },
		{ key: "feather", label: "Soft edge", type: "number", default: 0.3, min: 0, max: 1, step: 0.01 },
		{
			key: "fill",
			label: "Fill",
			type: "select",
			default: "blur",
			keyframable: false,
			options: [
				{ value: "blur", label: "Blur of the surroundings" },
				{ value: "colour", label: "Colour" },
			],
		},
		{ key: "colour", label: "Colour", type: "color", default: "#202020" },
	],
	renderer: {
		passes: [
			{
				shader: "nadir",
				uniforms: ({ effectParams }) => ({
					u_p0: [
						number({ params: effectParams, key: "size", fallback: 20 }) / 90,
						number({ params: effectParams, key: "feather", fallback: 0.3 }),
						effectParams.fill === "colour" ? 1 : 0,
						0,
					],
					u_p1: [...hexToRgb(effectParams.colour), 1],
				}),
			},
		],
	},
};
