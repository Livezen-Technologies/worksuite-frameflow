import type { EffectDefinition } from "@/effects/types";

export const LUT_EFFECT_TYPE = "lut";

/**
 * A 3D LUT from the LUT library (SRS WS-11, WS-35). Camera LUTs are input
 * transforms and sit first in a clip's effects (WS-37); creative LUTs sit
 * wherever the user puts them. `lutId` names an entry in the LUT library.
 */
export const lutEffectDefinition: EffectDefinition = {
	type: LUT_EFFECT_TYPE,
	name: "LUT",
	category: "Color",
	keywords: [
		"lut",
		"cube",
		"log",
		"rec709",
		"look",
		"camera",
		"d-log",
		"gp-log",
		"i-log",
	],
	params: [
		{
			key: "lutId",
			label: "LUT",
			type: "text",
			default: "",
			keyframable: false,
		},
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 100,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => {
			const id =
				typeof effectParams.lutId === "string" ? effectParams.lutId : "";
			const intensity =
				typeof effectParams.intensity === "number"
					? effectParams.intensity
					: 100;
			return [
				{
					shader: `lut3d:${id || "none"}`,
					uniforms: { u_intensity: Math.min(1, Math.max(0, intensity / 100)) },
				},
			];
		},
	},
};
