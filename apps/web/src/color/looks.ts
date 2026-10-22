import type { ParamValues } from "@/params";

/** Built-in looks (WS-11 "built-in looks"): partial color-grade params. */
export const COLOR_LOOKS: { id: string; name: string; params: ParamValues }[] =
	[
		{
			id: "warm-film",
			name: "Warm film",
			params: {
				temperature: 25,
				contrast: 10,
				saturation: -8,
				liftX: 0.25,
				liftY: 0.1,
				liftM: 0.06,
				highlights: -10,
			},
		},
		{
			id: "teal-orange",
			name: "Teal & orange",
			params: {
				liftX: -0.55,
				liftY: -0.5,
				gainX: 0.5,
				gainY: 0.2,
				contrast: 15,
				saturation: 10,
			},
		},
		{
			id: "cool-clean",
			name: "Cool & clean",
			params: {
				temperature: -25,
				tint: 5,
				contrast: 8,
				vibrance: 15,
				shadows: 8,
			},
		},
		{
			id: "punchy",
			name: "Punchy",
			params: {
				contrast: 25,
				vibrance: 30,
				saturation: 10,
				shadows: -10,
				highlights: 5,
			},
		},
		{
			id: "faded",
			name: "Faded",
			params: { liftM: 0.35, contrast: -20, saturation: -25, highlights: -15 },
		},
		{
			id: "black-white",
			name: "Black & white",
			params: { saturation: -100, contrast: 18 },
		},
	];
