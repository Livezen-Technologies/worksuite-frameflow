import { describe, expect, test } from "bun:test";
import { cuesToSrt, cuesToVtt } from "../caption-files";
import {
	estimateExportBytes,
	evenSize,
	fitRect,
	formatForCodec,
} from "../presets";

describe("export presets", () => {
	test("letterboxes a 16:9 project into a vertical frame", () => {
		expect(
			fitRect({
				source: { width: 1920, height: 1080 },
				target: { width: 1080, height: 1920 },
			}),
		).toEqual({ x: 0, y: 656, width: 1080, height: 608 });
	});

	test("sizes are made even for the encoder", () => {
		expect(evenSize({ width: 1081, height: 607 })).toEqual({
			width: 1082,
			height: 608,
		});
	});

	test("codecs pick their container", () => {
		expect(formatForCodec("vp9")).toBe("webm");
		expect(formatForCodec("av1")).toBe("mp4");
	});

	test("newer codecs estimate smaller files", () => {
		const base = {
			width: 1920,
			height: 1080,
			fps: 30,
			seconds: 60,
			quality: "high" as const,
			includeAudio: false,
		};
		expect(estimateExportBytes({ ...base, codec: "av1" })).toBeLessThan(
			estimateExportBytes({ ...base, codec: "avc" }),
		);
	});
});

describe("caption files", () => {
	const cues = [{ start: 1.5, end: 3.25, text: "ආයුබෝවන්" }];
	test("SRT", () => {
		expect(cuesToSrt(cues)).toBe(
			"1\n00:00:01,500 --> 00:00:03,250\nආයුබෝවන්\n",
		);
	});
	test("VTT", () => {
		expect(cuesToVtt(cues)).toStartWith(
			"WEBVTT\n\n00:00:01.500 --> 00:00:03.250\n",
		);
	});
});
