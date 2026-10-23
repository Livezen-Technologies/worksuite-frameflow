import { describe, expect, test } from "bun:test";
import { mergeSettings, pickFields } from "../settings-merge";

describe("settings sync merge", () => {
	test("newer change wins key by key", () => {
		const { merged, applyLocally, pushNeeded } = mergeSettings({
			local: {
				keys: { value: "mine", updatedAt: 20 },
				brand: { value: "old", updatedAt: 5 },
				onlyHere: { value: 1, updatedAt: 3 },
			},
			remote: {
				keys: { value: "theirs", updatedAt: 10 },
				brand: { value: "new", updatedAt: 9 },
				onlyThere: { value: 2, updatedAt: 1 },
			},
		});
		expect(merged.keys?.value).toBe("mine");
		expect(merged.brand?.value).toBe("new");
		expect(merged.onlyHere?.value).toBe(1);
		expect(applyLocally.sort()).toEqual(["brand", "onlyThere"]);
		expect(pushNeeded).toBe(true);
	});

	test("a fresh device takes the cloud's values and pushes nothing", () => {
		const { applyLocally, pushNeeded } = mergeSettings({
			local: { keys: { value: "default", updatedAt: 0 } },
			remote: { keys: { value: "custom", updatedAt: 0 } },
		});
		expect(applyLocally).toEqual(["keys"]);
		expect(pushNeeded).toBe(false);
	});

	test("picks and restores only chosen fields", () => {
		const saved = {
			state: { luts: [1], cameraProfiles: { a: "D-Log" }, autoApply: true },
			version: 0,
		};
		expect(
			pickFields({ saved, fields: ["cameraProfiles", "autoApply"] }),
		).toEqual({
			state: { cameraProfiles: { a: "D-Log" }, autoApply: true },
		});
		const local = {
			state: { luts: [9], cameraProfiles: {}, autoApply: false },
			version: 0,
		};
		expect(
			pickFields({
				saved: { state: { cameraProfiles: { b: "I-Log" }, autoApply: true } },
				fields: ["cameraProfiles", "autoApply"],
				into: local,
			}),
		).toEqual({
			state: { luts: [9], cameraProfiles: { b: "I-Log" }, autoApply: true },
			version: 0,
		});
	});
});
