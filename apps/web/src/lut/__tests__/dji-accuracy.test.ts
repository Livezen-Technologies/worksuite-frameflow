/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- colour tuples in fixtures */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { asStored, frameflowPixel, parsePpm } from "../accuracy";
import { applyCube, type CubeLut, parseCube } from "../cube";
import { deltaE2000, deltaEStats } from "../delta-e";

type Rgb = [number, number, number];

describe("CIEDE2000", () => {
	// Sharma, Wu & Dalal (2005) test pairs.
	test.each([
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 0, 0], [50, -1, 2], 2.3669],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
	])("%p vs %p", (a, b, want) => {
		expect(deltaE2000(a as [number, number, number], b as [number, number, number])).toBeCloseTo(want, 3);
	});
});

/** A log-to-Rec.709 transform shaped like a camera's (log decode, tone curve, a little saturation). */
function logTo709([r, g, b]: Rgb): Rgb {
	const decode = (v: number) => (v < 0.14 ? (v - 0.0929) / 6.025 : (10 ** ((v - 0.584) / 0.256) - 0.0108) / 0.98);
	const lin = [r, g, b].map((v) => Math.max(0, decode(v)));
	const y = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
	const sat = lin.map((v) => y + (v - y) * 1.15);
	const tone = (v: number) => {
		const t = v / (v + 0.18) * 1.18;
		return t < 0.018 ? 4.5 * t : 1.099 * t ** 0.45 - 0.099;
	};
	const [o0, o1, o2] = sat.map((v) => Math.min(1, Math.max(0, tone(Math.max(0, v)))));
	return [o0!, o1!, o2!];
}

function bake(size: number): CubeLut {
	const data = new Float32Array(size ** 3 * 3);
	for (let b = 0; b < size; b++)
		for (let g = 0; g < size; g++)
			for (let r = 0; r < size; r++) {
				const out = logTo709([r / (size - 1), g / (size - 1), b / (size - 1)]);
				data.set(out, ((b * size + g) * size + r) * 3);
			}
	return { title: "synthetic log", size, data };
}

describe("LUT accuracy (WS-48)", () => {
	// A vendor tool applies the same LUT, so the reference is that LUT applied
	// in full float precision; what's measured is FrameFlow's 8-bit storage,
	// interpolation and 8-bit output.
	test("a 33-point camera LUT stored at 8 bits stays within ΔE 2 of the LUT applied exactly", () => {
		const lut = bake(33);
		const stored = asStored(lut);
		let seed = 7;
		const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		const pairs: [Rgb, Rgb][] = [];
		for (let i = 0; i < 3000; i++) {
			const px: Rgb = [rand(), rand(), rand()].map((v) => Math.round(v * 255) / 255) as Rgb;
			const exact = applyCube({ lut, rgb: px }).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255) as Rgb;
			pairs.push([frameflowPixel({ stored, rgb: px }), exact]);
		}
		const stats = deltaEStats(pairs);
		console.log(`synthetic log LUT: mean ΔE ${stats.mean.toFixed(2)}, p95 ${stats.p95.toFixed(2)}, max ${stats.max.toFixed(2)}`);
		expect(stats.p95).toBeLessThan(1);
		expect(stats.max).toBeLessThan(2);
	});
});

/**
 * Real footage: put each case in fixtures/dji/<name>/ with lut.cube (DJI's
 * D-Log M LUT), log.ppm (a frame of the original clip) and reference.ppm
 * (the same frame with DJI's LUT applied in DJI's or another trusted tool).
 * See fixtures/dji/README.md.
 */
const root = path.resolve(import.meta.dir, "../../../fixtures/dji");
const cases = fs.existsSync(root)
	? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "lut.cube")))
	: [];

describe("DJI footage fixtures (WS-48)", () => {
	if (!cases.length) test.skip("no DJI fixtures in fixtures/dji yet", () => {});
	for (const name of cases) {
		test(`${name}: matches DJI's LUT result within ΔE 2`, () => {
			const dir = path.join(root, name);
			const stored = asStored(parseCube(fs.readFileSync(path.join(dir, "lut.cube"), "utf8")));
			const log = parsePpm(new Uint8Array(fs.readFileSync(path.join(dir, "log.ppm"))));
			const ref = parsePpm(new Uint8Array(fs.readFileSync(path.join(dir, "reference.ppm"))));
			expect([ref.width, ref.height]).toEqual([log.width, log.height]);
			const pairs: [Rgb, Rgb][] = [];
			const step = Math.max(1, Math.floor((log.width * log.height) / 20000));
			for (let i = 0; i < log.width * log.height; i += step) {
				const px = (src: Uint8Array): Rgb => [src[i * 3]! / 255, src[i * 3 + 1]! / 255, src[i * 3 + 2]! / 255];
				pairs.push([frameflowPixel({ stored, rgb: px(log.rgb) }), px(ref.rgb)]);
			}
			const stats = deltaEStats(pairs);
			console.log(`${name}: mean ΔE ${stats.mean.toFixed(2)}, p95 ${stats.p95.toFixed(2)}, max ${stats.max.toFixed(2)}`);
			expect(stats.mean).toBeLessThan(2);
			expect(stats.p95).toBeLessThan(2);
		});
	}
});
