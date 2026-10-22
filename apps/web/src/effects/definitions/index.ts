import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorGradeEffectDefinition } from "./color-grade";
import { STYLISE_EFFECTS } from "./stylise";

const defaultEffects = [
	blurEffectDefinition,
	colorGradeEffectDefinition,
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
