import type { ParamDefinition, ParamValues } from "@/params";

export interface Effect {
	id: string;
	type: string;
	params: ParamValues;
	enabled: boolean;
}

export type EffectUniformValue = number | number[];

export interface EffectPass {
	shader: string;
	uniforms: Record<string, EffectUniformValue>;
	/** Sample across the left/right edge of a 360° frame (VR-18). */
	wrap?: boolean;
}

export interface EffectPassTemplate {
	shader: string;
	uniforms(params: {
		effectParams: ParamValues;
		width: number;
		height: number;
		/** Seconds into the clip or adjustment layer, for animated effects. */
		time: number;
	}): Record<string, EffectUniformValue>;
}

export interface EffectRendererConfig {
	passes: EffectPassTemplate[];
	buildPasses?: (params: {
		effectParams: ParamValues;
		width: number;
		height: number;
		time: number;
	}) => EffectPass[];
}

/** Effect browser categories (SRS WS-22). */
export type EffectCategory =
	| "Blur"
	| "Stylise"
	| "Distort"
	| "Light"
	| "Retro"
	| "Color";

export interface EffectDefinition {
	type: string;
	name: string;
	keywords: string[];
	category?: EffectCategory;
	/**
	 * False for effects built around the frame's centre or edges (vignette,
	 * mirror, wave), which can't wrap round a 360° sphere (VR-18).
	 */
	sphereSafe?: boolean;
	params: ParamDefinition[];
	renderer: EffectRendererConfig;
}
