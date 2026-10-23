import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { injectHdrMetadata, readHdrMetadata } from "../webm-hdr-metadata";
import {
	classifyPixel,
	frameLightLevel,
	hlgPixelNits,
	LightLevelMeter,
} from "../light-level";

const fixture = () => {
	const b = readFileSync(join(import.meta.dir, "fixtures", "hlg-tiny.webm"));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe("HDR10 static metadata in WebM", () => {
	test("written into Colour and read back; file otherwise intact", () => {
		const input = fixture();
		const { buffer, injected } = injectHdrMetadata({
			buffer: input,
			meta: {
				maxCll: 812,
				maxFall: 214,
				maxLuminance: 1000,
				minLuminance: 0.0001,
			},
		});
		expect(injected).toBe(true);
		expect(readHdrMetadata({ buffer })).toEqual({ maxCll: 812, maxFall: 214 });
		// Injecting twice replaces, never duplicates.
		const again = injectHdrMetadata({
			buffer,
			meta: {
				maxCll: 900,
				maxFall: 300,
				maxLuminance: 1000,
				minLuminance: 0.0001,
			},
		});
		expect(readHdrMetadata({ buffer: again.buffer })).toEqual({
			maxCll: 900,
			maxFall: 300,
		});
		// Same content apart from the values (300 needs one more byte than 214).
		expect(
			Math.abs(again.buffer.byteLength - buffer.byteLength),
		).toBeLessThanOrEqual(2);
	});

	test("anything that isn't WebM comes back unchanged", () => {
		const junk = new Uint8Array([1, 2, 3, 4]).buffer;
		expect(
			injectHdrMetadata({
				buffer: junk,
				meta: { maxCll: 1, maxFall: 1, maxLuminance: 1000, minLuminance: 0 },
			}).injected,
		).toBe(false);
	});
});

describe("light levels of the HLG signal", () => {
	test("graphics white (HLG 75%) is ~203 nits; full signal is 1,000", () => {
		const white = hlgPixelNits({ r: 191, g: 191, b: 191 })[0];
		expect(white).toBeGreaterThan(190);
		expect(white).toBeLessThan(215);
		expect(hlgPixelNits({ r: 255, g: 255, b: 255 })[0]).toBeCloseTo(1000, 0);
	});

	test("MaxCLL is the brightest pixel; MaxFALL the brightest frame average", () => {
		const frame = (v: number[]) =>
			new Uint8ClampedArray(v.flatMap((x) => [x, x, x, 255]));
		const meter = new LightLevelMeter();
		meter.add({ rgba: frame([255, 0, 0, 0]) });
		meter.add({ rgba: frame([191, 191, 191, 191]) });
		const { maxCll, maxFall } = meter.result();
		expect(maxCll).toBe(1000);
		// First frame: one 1,000-nit pixel in four averages 250, above the grey frame's ~202.
		expect(maxFall).toBe(250);
		expect(
			Math.round(frameLightLevel({ rgba: frame([191, 191, 191, 191]) }).fall),
		).toBeLessThan(250);
	});

	test("false colour flags over-bright, highlights and out-of-709 colours", () => {
		expect(classifyPixel({ r: 255, g: 255, b: 255 })).toBe("over");
		expect(classifyPixel({ r: 220, g: 220, b: 220 })).toBe("highlight");
		expect(classifyPixel({ r: 120, g: 120, b: 120 })).toBe("normal");
		expect(classifyPixel({ r: 0, g: 200, b: 0 })).toBe("gamut");
	});
});

describe("reading stored light levels (HD-01)", () => {
	test("MP4 clli box", async () => {
		const { readLightLevel } = await import("../read-light-level");
		const box = new Uint8Array([
			0, 0, 0, 12, 0x63, 0x6c, 0x6c, 0x69, 0x03, 0x2c, 0x00, 0xd6,
		]);
		const file = new Blob([new Uint8Array(100), box, new Uint8Array(50)]);
		expect(await readLightLevel({ file })).toEqual({
			maxCll: 812,
			maxFall: 214,
		});
	});

	test("WebM written by the exporter", async () => {
		const { readLightLevel } = await import("../read-light-level");
		const { buffer } = injectHdrMetadata({
			buffer: fixture(),
			meta: {
				maxCll: 640,
				maxFall: 120,
				maxLuminance: 1000,
				minLuminance: 0.0001,
			},
		});
		expect(await readLightLevel({ file: new Blob([buffer]) })).toEqual({
			maxCll: 640,
			maxFall: 120,
		});
	});
});
