import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorGradeEffectDefinition } from "./color-grade";
import { STYLISE_EFFECTS } from "./stylise";
import { lutEffectDefinition } from "./lut";
import { curvesEffectDefinition } from "./curves";
import { reframeEffectDefinition } from "@/vr/projection";
import { nadirEffectDefinition } from "@/vr/nadir";

const defaultEffects = [
	blurEffectDefinition,
	colorGradeEffectDefinition,
	lutEffectDefinition,
	curvesEffectDefinition,
	reframeEffectDefinition,
	nadirEffectDefinition,
	...STYLISE_EFFECTS,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
