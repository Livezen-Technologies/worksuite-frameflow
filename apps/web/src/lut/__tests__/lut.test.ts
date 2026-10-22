import { describe, expect, test } from "bun:test";
import { identifyFootage, identifyLutFile } from "../cameras";
import { applyCube, cubeToRgba8, parseCube } from "../cube";

function identityCube({
	size,
	transform = (v: number[]) => v,
}: {
	size: number;
	transform?: (v: number[]) => number[];
}) {
	const lines = [`TITLE "test"`, `LUT_3D_SIZE ${size}`];
	for (let b = 0; b < size; b++)
		for (let g = 0; g < size; g++)
			for (let r = 0; r < size; r++)
				lines.push(
					transform([r / (size - 1), g / (size - 1), b / (size - 1)]).join(" "),
				);
	return lines.join("\n");
}

describe(".cube", () => {
	test("parses size, title and data", () => {
		const lut = parseCube(identityCube({ size: 17 }));
		expect(lut.size).toBe(17);
		expect(lut.title).toBe("test");
		expect(lut.data.length).toBe(17 ** 3 * 3);
	});

	test("identity LUT leaves colours unchanged", () => {
		const lut = parseCube(identityCube({ size: 17 }));
		const out = applyCube({ lut, rgb: [0.31, 0.62, 0.9] });
		expect(out[0]).toBeCloseTo(0.31, 5);
		expect(out[2]).toBeCloseTo(0.9, 5);
	});

	test("a non-linear LUT interpolates between points", () => {
		const lut = parseCube(
			identityCube({ size: 33, transform: ([r, g, b]) => [r * r, g, 1 - b] }),
		);
		const [r, g, b] = applyCube({ lut, rgb: [0.5, 0.2, 0.25] });
		expect(r).toBeCloseTo(0.25, 2);
		expect(g).toBeCloseTo(0.2, 5);
		expect(b).toBeCloseTo(0.75, 5);
	});

	test("DOMAIN is respected and RGBA8 packs alpha", () => {
		const text = identityCube({
			size: 2,
			transform: (v) => v.map((x) => x * 2),
		}).replace("LUT_3D_SIZE 2", "LUT_3D_SIZE 2\nDOMAIN_MAX 2 2 2");
		const rgba = cubeToRgba8(parseCube(text));
		expect(Array.from(rgba.slice(-4))).toEqual([255, 255, 255, 255]);
	});

	test("refuses 1D LUTs and short data", () => {
		expect(() => parseCube("LUT_1D_SIZE 1024\n0 0 0")).toThrow();
		expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0")).toThrow();
	});
});

describe("camera recognition", () => {
	test("DJI file names (WS-44)", () => {
		const a = identifyLutFile("DJI_Mini4Pro_D-LogM_to_Rec709_V1.cube");
		expect(a.camera?.model).toBe("Mini 4 Pro");
		expect(a.profile).toBe("D-Log M");
		const b = identifyLutFile("Mavic 3 Pro D-Log to Rec.709 vivid.cube");
		expect(b.camera?.model).toBe("Mavic 3 Pro");
		expect(b.profile).toBe("D-Log");
		const c = identifyLutFile("Osmo Action 4 D-Log M to Rec.709 V1.cube");
		expect(c.camera?.model).toBe("Osmo Action 4");
		expect(c.profile).toBe("D-Log M");
	});

	test("GoPro and Insta360 file names", () => {
		expect(identifyLutFile("GoPro_GP-Log_to_Rec709.cube")).toMatchObject({
			brand: "GoPro",
			profile: "GP-Log",
		});
		expect(
			identifyLutFile("Ace Pro 2 I-Log to Rec709.cube").camera?.model,
		).toBe("Ace Pro 2");
	});

	test("footage metadata (WS-45)", () => {
		const header = new TextEncoder().encode(
			"....moov....udta..©makDJI..©modDJI Mini 4 Pro....",
		);
		const found = identifyFootage(header);
		expect(found.brand).toBe("DJI");
		expect(found.camera?.model).toBe("Mini 4 Pro");
		expect(found.profile).toBeNull();
	});
});
