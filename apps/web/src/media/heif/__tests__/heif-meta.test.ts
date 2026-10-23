import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { primaryColor, readHeifMeta } from "../boxes";
import { readHeifExif } from "../exif";

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dir, "fixtures", name)));

describe("HEIF metadata", () => {
	test("reads date, camera and place from EXIF (HE-09)", () => {
		const info = readHeifExif(fixture("exif.heic"));
		expect(info?.make).toBe("Apple");
		expect(info?.model).toBe("iPhone 15 Pro");
		expect(info?.takenAt).toBe("2024:05:01 14:03:22 +05:30");
		expect(info?.latitude).toBeCloseTo(6.925, 3);
		expect(info?.longitude).toBeCloseTo(79.86, 3);
		expect(info?.altitude).toBeCloseTo(12.5, 3);
	});

	test("a photo without EXIF has none", () => {
		expect(readHeifExif(fixture("three.heic"))).toBeNull();
	});

	test("finds Display P3 primaries (HE-03)", () => {
		const p3 = readHeifMeta(fixture("p3.heic"));
		expect(p3 && primaryColor(p3)).toBe("display-p3");
		const plain = readHeifMeta(fixture("three.heic"));
		expect(plain && primaryColor(plain)).not.toBe("display-p3");
	});

	test("lists every picture", () => {
		const meta = readHeifMeta(fixture("three.heic"));
		expect([...(meta?.items.values() ?? [])].filter((i) => i.type === "hvc1").length).toBe(3);
	});
});

describe("Display P3 to sRGB", () => {
	test("white stays white, grey stays grey, P3 green clips to sRGB green", async () => {
		const { p3ToSrgb } = await import("../color");
		const px = new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 255, 0, 255, 0, 255, 255, 0, 0, 255]);
		p3ToSrgb(px);
		expect([...px.slice(0, 3)]).toEqual([255, 255, 255]);
		expect([...px.slice(4, 7)].every((v) => Math.abs(v - 128) <= 1)).toBe(true);
		expect([...px.slice(8, 11)]).toEqual([0, 255, 0]);
		// P3 red is more saturated than sRGB red: it clips at full red.
		expect(px[12]).toBe(255);
		expect(px[13]).toBe(0);
	});
});
