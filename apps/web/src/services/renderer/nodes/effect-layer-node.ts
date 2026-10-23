import type { EffectPass } from "@/effects/types";
import type { ParamValues } from "@/params";
import type { PrivacyRegion } from "@/privacy/region";
import { BaseNode } from "./base-node";

export type EffectLayerNodeParams = {
	effectType: string;
	effectParams: ParamValues;
	timeOffset: number;
	duration: number;
	region?: PrivacyRegion;
};

export type ResolvedEffectLayerNodeState = {
	passes: EffectPass[];
};

export class EffectLayerNode extends BaseNode<
	EffectLayerNodeParams,
	ResolvedEffectLayerNodeState
> {}
