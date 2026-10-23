import { describe, expect, test } from "bun:test";
import { judgeHardware } from "../hardware";

const base = { hasGpu: true, maxBufferBytes: 1024 ** 3, deviceMemoryGb: 8 };

describe("AI export hardware check", () => {
	test("1080p upscaling on a normal machine is fine", () => {
		expect(judgeHardware({ ...base, kind: "upscale", width: 1920, height: 1080 }).ok).toBe(true);
	});

	test("8K interpolation on 2 GB suggests a lower resolution", () => {
		const v = judgeHardware({ ...base, deviceMemoryGb: 2, kind: "interpolate", width: 7680, height: 4320 });
		expect(v.ok).toBe(false);
		expect(v.suggestedLevel).toBe(1080);
		expect(v.reason).toContain("memory");
	});

	test("no GPU: runs but marked slow, refuses big interpolation", () => {
		expect(judgeHardware({ ...base, hasGpu: false, kind: "upscale", width: 1280, height: 720 })).toEqual({
			ok: true,
			slow: true,
		});
		expect(
			judgeHardware({ ...base, hasGpu: false, kind: "interpolate", width: 3840, height: 2160 }).ok,
		).toBe(false);
	});
});
