import type { ParamDefinition, ParamValues } from "@/params";
import type { EffectDefinition, EffectUniformValue } from "@/effects/types";

export const COLOR_GRADE_EFFECT_TYPE = "color-grade";
export const COLOR_GRADE_SHADER = "color-grade";

/** Lift, Gamma, Gain and Offset, as in the SRS (WS-07) and the Color screen. */
export const COLOR_WHEELS = [
	{ key: "lift", label: "Lift", strength: 0.25 },
	{ key: "gamma", label: "Gamma", strength: 0.5 },
	{ key: "gain", label: "Gain", strength: 0.5 },
	{ key: "offset", label: "Offset", strength: 0.2 },
] as const;

export type ColorWheelKey = (typeof COLOR_WHEELS)[number]["key"];

/** Sliders (WS-08). Stored in display units; the shader gets them scaled. */
export const COLOR_SLIDERS = [
	{
		key: "exposure",
		label: "Exposure",
		min: -3,
		max: 3,
		step: 0.05,
		scale: 1,
		unit: "stops",
	},
	{
		key: "contrast",
		label: "Contrast",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
	{
		key: "temperature",
		label: "Temperature",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
	{
		key: "tint",
		label: "Tint",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
	{
		key: "saturation",
		label: "Saturation",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
	{
		key: "vibrance",
		label: "Vibrance",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
	{
		key: "highlights",
		label: "Highlights",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
	{
		key: "shadows",
		label: "Shadows",
		min: -100,
		max: 100,
		step: 1,
		scale: 0.01,
		unit: "",
	},
] as const;

export type ColorSliderKey = (typeof COLOR_SLIDERS)[number]["key"];

/** Param keys for a wheel: x/y = colour push inside the disc (−1…1), m = master. */
export function wheelParamKeys(wheel: ColorWheelKey) {
	return { x: `${wheel}X`, y: `${wheel}Y`, m: `${wheel}M` } as const;
}

function wheelParams(): ParamDefinition[] {
	return COLOR_WHEELS.flatMap(({ key, label }) => {
		const keys = wheelParamKeys(key);
		return [
			{
				key: keys.x,
				label: `${label} ↔`,
				type: "number",
				default: 0,
				min: -1,
				max: 1,
				step: 0.01,
			},
			{
				key: keys.y,
				label: `${label} ↕`,
				type: "number",
				default: 0,
				min: -1,
				max: 1,
				step: 0.01,
			},
			{
				key: keys.m,
				label: `${label} master`,
				type: "number",
				default: 0,
				min: -1,
				max: 1,
				step: 0.01,
			},
		] satisfies ParamDefinition[];
	});
}

function sliderParams(): ParamDefinition[] {
	return COLOR_SLIDERS.map(({ key, label, min, max, step }) => ({
		key,
		label,
		type: "number",
		default: 0,
		min,
		max,
		step,
	}));
}

function num({ params, key }: { params: ParamValues; key: string }): number {
	const value = params[key];
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A point in the wheel's disc → an RGB push that sums to zero, so moving the
 * puck changes hue balance without brightening (that's the master's job).
 * Angle 0 (right) pushes red, 120° green, 240° blue.
 */
export function wheelToRgb({
	x,
	y,
}: {
	x: number;
	y: number;
}): [number, number, number] {
	const radius = Math.min(1, Math.hypot(x, y));
	if (radius === 0) return [0, 0, 0];
	const angle = Math.atan2(y, x);
	const third = (2 * Math.PI) / 3;
	return [
		radius * Math.cos(angle),
		radius * Math.cos(angle - third),
		radius * Math.cos(angle + third),
	];
}

export function colorGradeUniforms(
	params: ParamValues,
): Record<string, EffectUniformValue> {
	const uniforms: Record<string, EffectUniformValue> = {};
	for (const { key, strength } of COLOR_WHEELS) {
		const keys = wheelParamKeys(key);
		const [r, g, b] = wheelToRgb({
			x: num({ params, key: keys.x }),
			y: num({ params, key: keys.y }),
		});
		uniforms[`u_${key}`] = [
			r * strength,
			g * strength,
			b * strength,
			num({ params, key: keys.m }) * strength,
		];
	}
	const slider = (key: ColorSliderKey) => {
		const definition = COLOR_SLIDERS.find((s) => s.key === key)!;
		return num({ params, key }) * definition.scale;
	};
	uniforms.u_tone = [
		slider("exposure"),
		slider("contrast"),
		slider("saturation"),
		slider("vibrance"),
	];
	uniforms.u_balance = [
		slider("temperature"),
		slider("tint"),
		slider("highlights"),
		slider("shadows"),
	];
	return uniforms;
}

export function isNeutralGrade(params: ParamValues): boolean {
	return [...wheelParams(), ...sliderParams()].every(
		(param) => num({ params, key: param.key }) === 0,
	);
}

export const colorGradeEffectDefinition: EffectDefinition = {
	type: COLOR_GRADE_EFFECT_TYPE,
	name: "Color grade",
	category: "Color",
	keywords: [
		"color",
		"colour",
		"grade",
		"wheels",
		"lift",
		"gamma",
		"gain",
		"exposure",
		"saturation",
		"temperature",
	],
	params: [...sliderParams(), ...wheelParams()],
	renderer: {
		passes: [
			{
				shader: COLOR_GRADE_SHADER,
				uniforms: ({ effectParams }) => colorGradeUniforms(effectParams),
			},
		],
	},
};
