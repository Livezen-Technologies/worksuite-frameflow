import { describe, expect, test } from "bun:test";
import { FILTER_PRESETS, readClipFilter, withFilter } from "../library";

const preset = (id: string) => {
	const found = FILTER_PRESETS.find((p) => p.id === id);
	if (!found) throw new Error(id);
	return found;
};
let n = 0;
const makeId = () => `id${n++}`;

describe("filters", () => {
	test("applying puts the filter first and keeps other effects", () => {
		const own = { id: "mine", type: "blur", params: {}, enabled: true };
		const effects = withFilter({ effects: [own], preset: preset("teal-orange"), makeId });
		expect(effects[0].type).toBe("color-grade");
		expect(effects.at(-1)).toEqual(own);
		expect(readClipFilter(effects)).toEqual({ id: "teal-orange", strength: 100 });
	});

	test("switching replaces the old filter, None removes it", () => {
		const first = withFilter({ effects: [], preset: preset("moody"), makeId });
		const second = withFilter({ effects: first, preset: preset("vivid"), makeId });
		expect(second.filter((e) => e.id.startsWith("filter-"))).toHaveLength(1);
		expect(readClipFilter(second)?.id).toBe("vivid");
		expect(withFilter({ effects: second, preset: null, makeId })).toHaveLength(0);
	});

	test("strength scales the grade", () => {
		const half = withFilter({ effects: [], preset: preset("vivid"), strength: 50, makeId });
		expect(half[0].params.saturation).toBe(11);
		expect(readClipFilter(half)?.strength).toBe(50);
	});

	test("grades only use color-grade params", () => {
		const keys = new Set(["exposure", "contrast", "temperature", "tint", "saturation", "vibrance", "highlights", "shadows"]);
		for (const p of FILTER_PRESETS) {
			for (const key of Object.keys(p.grade)) {
				expect(keys.has(key) || /^(lift|gamma|gain|offset)[XYM]$/.test(key)).toBe(true);
			}
		}
	});
});
