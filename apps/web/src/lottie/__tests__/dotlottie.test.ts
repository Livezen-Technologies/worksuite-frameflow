import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { dotLottieText } from "../user-library";

const anim = { v: "5.7.0", fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [], assets: [{ id: "img_0", p: "img_0.png", u: "images/", w: 1, h: 1 }] };

describe("dotLottieText", () => {
	test("reads the manifest's first animation and inlines its images", () => {
		const zip = zipSync({
			"manifest.json": strToU8(JSON.stringify({ animations: [{ id: "intro" }] })),
			"animations/intro.json": strToU8(JSON.stringify(anim)),
			"images/img_0.png": new Uint8Array([137, 80, 78, 71]),
		});
		const json = JSON.parse(dotLottieText(zip));
		expect(json.w).toBe(100);
		expect(json.assets[0].p).toBe("data:image/png;base64,iVBORw==");
		expect(json.assets[0].e).toBe(1);
	});

	test("falls back to any animation without a manifest", () => {
		const zip = zipSync({ "a/x.json": strToU8(JSON.stringify({ ...anim, assets: [] })) });
		expect(JSON.parse(dotLottieText(zip)).fr).toBe(30);
	});

	test("rejects an archive with no animation", () => {
		expect(() => dotLottieText(zipSync({ "readme.txt": strToU8("hi") }))).toThrow();
	});
});
