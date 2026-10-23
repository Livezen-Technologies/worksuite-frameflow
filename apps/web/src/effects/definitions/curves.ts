import type { ParamDefinition, ParamValues } from "@/params";
import type { EffectDefinition } from "@/effects/types";
import {
	BAKE_SIZE,
	bakeLut,
	DEFAULT_CURVES,
	DEFAULT_QUALIFIER,
	type CurveChannel,
	type Curves,
	type HslQualifier,
	parseCurve,
	serializeCurve,
} from "@/color/curves";
import { curvesAt, parseCurveKeys } from "@/color/curve-keys";
import { ensureGeneratedLutUploaded } from "@/lut/library";

export const CURVES_EFFECT_TYPE = "curves";

const CHANNELS: CurveChannel[] = [
	"luma",
	"red",
	"green",
	"blue",
	"hueVsHue",
	"hueVsSat",
];

const curveParam = (channel: CurveChannel): ParamDefinition => ({
	key: `curve.${channel}`,
	label: channel,
	type: "text",
	default: serializeCurve(DEFAULT_CURVES[channel]),
	keyframable: false,
});

const numberParam = ({
	key,
	min,
	max,
	value,
}: {
	key: keyof HslQualifier;
	min: number;
	max: number;
	value: number;
}): ParamDefinition => ({
	key: `hsl.${key}`,
	label: key,
	type: "number",
	default: value,
	min,
	max,
	step: 0.01,
});

const boolParam = (key: keyof HslQualifier): ParamDefinition => ({
	key: `hsl.${key}`,
	label: key,
	type: "boolean",
	default: Boolean(DEFAULT_QUALIFIER[key]),
});

export function readCurves(params: ParamValues): Curves {
	const curves = { ...DEFAULT_CURVES };
	for (const channel of CHANNELS)
		curves[channel] = parseCurve({
			text: params[`curve.${channel}`],
			fallback: DEFAULT_CURVES[channel],
		});
	return curves;
}

export function readQualifier(params: ParamValues): HslQualifier {
	const n = (key: keyof HslQualifier) => {
		const v = params[`hsl.${key}`];
		const fallback = DEFAULT_QUALIFIER[key];
		return typeof v === "number" && Number.isFinite(v)
			? v
			: typeof fallback === "number"
				? fallback
				: 0;
	};
	const b = (key: keyof HslQualifier) => {
		const v = params[`hsl.${key}`];
		return typeof v === "boolean" ? v : Boolean(DEFAULT_QUALIFIER[key]);
	};
	return {
		enabled: b("enabled"),
		hue: n("hue"),
		hueWidth: n("hueWidth"),
		satMin: n("satMin"),
		satMax: n("satMax"),
		lumMin: n("lumMin"),
		lumMax: n("lumMax"),
		softness: n("softness"),
		invert: b("invert"),
		showMask: b("showMask"),
		hueShift: n("hueShift"),
		saturation: n("saturation"),
		lightness: n("lightness"),
	};
}

/** Stable short id for a grade, so identical grades share one LUT. */
function hashGrade({ params, curves }: { params: ParamValues; curves: Curves }): string {
	const text = JSON.stringify([
		CHANNELS.map((c) => serializeCurve(curves[c])),
		Object.keys(params)
			.filter((k) => k.startsWith("hsl."))
			.sort()
			.map((k) => [k, params[k]]),
	]);
	let h = 2166136261;
	for (let i = 0; i < text.length; i++)
		h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
}

/**
 * Curves (luma, RGB, hue vs hue, hue vs saturation) and an HSL qualifier
 * with its own adjustments (SRS WS-09). Baked to a 3D LUT per settings.
 */
export const curvesEffectDefinition: EffectDefinition = {
	type: CURVES_EFFECT_TYPE,
	name: "Curves & HSL",
	category: "Color",
	keywords: [
		"curves",
		"rgb",
		"luma",
		"hsl",
		"qualifier",
		"secondary",
		"hue",
		"saturation",
		"select colour",
	],
	params: [
		...CHANNELS.map(curveParam),
		// Keyframed curves (WS-15), JSON; empty when the curves don't change over time.
		{ key: "curve.keys", label: "keys", type: "text", default: "", keyframable: false },
		boolParam("enabled"),
		numberParam({ key: "hue", min: 0, max: 1, value: DEFAULT_QUALIFIER.hue }),
		numberParam({
			key: "hueWidth",
			min: 0.01,
			max: 1,
			value: DEFAULT_QUALIFIER.hueWidth,
		}),
		numberParam({
			key: "satMin",
			min: 0,
			max: 1,
			value: DEFAULT_QUALIFIER.satMin,
		}),
		numberParam({
			key: "satMax",
			min: 0,
			max: 1,
			value: DEFAULT_QUALIFIER.satMax,
		}),
		numberParam({
			key: "lumMin",
			min: 0,
			max: 1,
			value: DEFAULT_QUALIFIER.lumMin,
		}),
		numberParam({
			key: "lumMax",
			min: 0,
			max: 1,
			value: DEFAULT_QUALIFIER.lumMax,
		}),
		numberParam({
			key: "softness",
			min: 0,
			max: 1,
			value: DEFAULT_QUALIFIER.softness,
		}),
		boolParam("invert"),
		boolParam("showMask"),
		numberParam({ key: "hueShift", min: -0.5, max: 0.5, value: 0 }),
		numberParam({ key: "saturation", min: 0, max: 2, value: 1 }),
		numberParam({ key: "lightness", min: -0.5, max: 0.5, value: 0 }),
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => {
			const keys = parseCurveKeys(effectParams["curve.keys"]);
			const curves = curvesAt({ keys, t: time, fallback: readCurves(effectParams) });
			const id = `curves:${hashGrade({ params: effectParams, curves })}`;
			ensureGeneratedLutUploaded({
				id,
				size: BAKE_SIZE,
				make: () =>
					bakeLut({
						curves,
						qualifier: readQualifier(effectParams),
					}),
			});
			return [{ shader: `lut3d:${id}`, uniforms: { u_intensity: 1 } }];
		},
	},
};
