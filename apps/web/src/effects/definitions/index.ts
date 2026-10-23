import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorGradeEffectDefinition } from "./color-grade";
import { STYLISE_EFFECTS } from "./stylise";
import { lutEffectDefinition } from "./lut";
import { reframeEffectDefinition } from "@/vr/projection";

const defaultEffects = [
	blurEffectDefinition,
	colorGradeEffectDefinition,
	lutEffectDefinition,
	reframeEffectDefinition,
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
