import { describe, expect, test } from "bun:test";
import { asRecord, AutomationError, num, oneOf, str } from "../params";

describe("automation params", () => {
	test("objects only", () => {
		expect(asRecord(undefined)).toEqual({});
		expect(() => asRecord([1])).toThrow(AutomationError);
		expect(() => asRecord("x")).toThrow(/object/);
	});

	test("typed fields with invalid-params code", () => {
		const params = { name: "Promo", w: 1920, q: "high", bad: "9" };
		expect(str({ params, key: "name" })).toBe("Promo");
		expect(str({ params, key: "missing" })).toBeUndefined();
		expect(num({ params, key: "w", min: 16, max: 16384 })).toBe(1920);
		expect(oneOf({ params, key: "q", values: ["low", "high"] as const })).toBe(
			"high",
		);
		try {
			num({ params, key: "bad" });
			throw new Error("should throw");
		} catch (error) {
			expect(error instanceof AutomationError && error.code).toBe(-32602);
		}
		expect(() => str({ params, key: "missing", required: true })).toThrow(
			/required/,
		);
		expect(() =>
			oneOf({ params: { q: "ultra" }, key: "q", values: ["low"] as const }),
		).toThrow(/one of/);
	});
});
