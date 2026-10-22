import { describe, expect, test } from "bun:test";
import { ellipseGraphicDefinition } from "@/graphics/definitions/ellipse";
import { extraGraphicDefinitions } from "@/graphics/definitions/extras";
import { polygonGraphicDefinition } from "@/graphics/definitions/polygon";
import { rectangleGraphicDefinition } from "@/graphics/definitions/rectangle";
import { starGraphicDefinition } from "@/graphics/definitions/star";
import { ELEMENT_PRESETS } from "../library";

describe("elements library", () => {
	const definitions = new Map(
		[
			rectangleGraphicDefinition,
			ellipseGraphicDefinition,
			polygonGraphicDefinition,
			starGraphicDefinition,
			...extraGraphicDefinitions,
		].map((d) => [d.id, d]),
	);

	test("ids are unique", () => {
		const ids = ELEMENT_PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("every shape preset uses a registered graphic and its own params", () => {
		for (const preset of ELEMENT_PRESETS) {
			if (preset.kind !== "graphic") continue;
			const definition = definitions.get(preset.definitionId);
			expect(definition).toBeDefined();
			if (!definition) continue;
			const keys = new Set(definition.params.map((p) => p.key));
			for (const key of Object.keys(preset.params)) expect(keys.has(key)).toBe(true);
		}
	});
});
