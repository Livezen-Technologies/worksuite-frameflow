import { describe, expect, test } from "bun:test";
import { histogram, luma, vectorscope, waveform } from "../scopes";

function frame({
	pixels,
	width,
}: {
	pixels: [number, number, number, number][];
	width: number;
}) {
	return {
		width,
		height: pixels.length / width,
		data: new Uint8ClampedArray(pixels.flat()),
	};
}

describe("scopes", () => {
	test("luma uses Rec.709 weights", () => {
		expect(luma({ r: 255, g: 255, b: 255 })).toBe(255);
		expect(luma({ r: 0, g: 255, b: 0 })).toBe(182);
	});

	test("waveform counts levels per column and skips transparent pixels", () => {
		const f = frame({
			pixels: [
				[255, 255, 255, 255],
				[0, 0, 0, 255],
				[0, 0, 0, 0],
				[255, 255, 255, 255],
			],
			width: 2,
		});
		const w = waveform({ frame: f });
		expect(w[0 * 256 + 255]).toBe(1);
		expect(w[0 * 256 + 0]).toBe(0);
		expect(w[1 * 256 + 0]).toBe(1);
		expect(w[1 * 256 + 255]).toBe(1);
		const red = waveform({
			frame: frame({ pixels: [[200, 10, 10, 255]], width: 1 }),
			channel: 0,
		});
		expect(red[200]).toBe(1);
	});

	test("histogram per channel", () => {
		const h = histogram(
			frame({
				pixels: [
					[10, 20, 30, 255],
					[10, 20, 30, 255],
				],
				width: 2,
			}),
		);
		expect(h.r[10]).toBe(2);
		expect(h.g[20]).toBe(2);
		expect(h.b[30]).toBe(2);
	});

	test("vectorscope puts grey at the centre and red up and to the left", () => {
		const size = 129;
		const grey = vectorscope({
			frame: frame({ pixels: [[128, 128, 128, 255]], width: 1 }),
			size,
		});
		expect(grey[64 * size + 64]).toBe(1);
		const red = vectorscope({
			frame: frame({ pixels: [[255, 0, 0, 255]], width: 1 }),
			size,
		});
		const index = red.findIndex((count) => count > 0);
		const x = index % size;
		const y = Math.floor(index / size);
		expect(y).toBeLessThan(64); // Cr > 0 → up
		expect(x).toBeLessThan(64); // Cb < 0 → left of centre
	});
});
