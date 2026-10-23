import { describe, expect, test } from "bun:test";
import { bitDepthFromCodec } from "../bit-depth";

describe("bit depth from codec strings", () => {
	test.each([
		["vp09.02.10.10", 10],
		["vp09.00.10.08", 8],
		["av01.0.08M.10", 10],
		["av01.0.04M.08", 8],
		["hvc1.2.4.L120.B0", 10],
		["hvc1.1.6.L93.B0", 8],
		["avc1.6E0028", 10],
		["avc1.640028", 8],
		["mp4v.20.9", 8],
		[null, 8],
	])("%p → %p", (codec, bits) => {
		expect(bitDepthFromCodec(codec)).toBe(bits);
	});
});
