import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { hexToRgba, lottieToMotion, motionToLottie, rgbaToHex } from "../lottie-convert";
import { createLayer, createMotionProject, EASES, layerBounds, setKeyframe, valueAt } from "../model";

const rasterizeText = async () => ({ src: "data:image/png;base64,AA==", w: 200, h: 60 });

describe("lottie conversion", () => {
	test("colours", () => {
		expect(hexToRgba("#FF8000")).toEqual([1, 128 / 255, 0, 1]);
		expect(rgbaToHex([1, 0.5, 0, 1])).toBe("#FF8000");
	});

	test("export then import keeps shapes, transforms and keyframes", async () => {
		const project = createMotionProject({ width: 800, height: 600, fps: 30, duration: 2 });
		let rect = { ...createLayer({ kind: "rect", project }), radius: 12, rotation: 15 };
		rect = setKeyframe({ layer: rect, prop: "x", t: 0, v: 100, ease: EASES.easeOut });
		rect = setKeyframe({ layer: rect, prop: "x", t: 1, v: 700 });
		const star = { ...createLayer({ kind: "star", project }), x: 200, y: 150 };
		const text = createLayer({ kind: "text", project });
		project.layers = [rect, star, text];
		project.background = "#112233";

		const json = await motionToLottie({ project, rasterizeText });
		expect(json.layers).toHaveLength(4);
		expect(json.op).toBe(60);
		expect(JSON.stringify(json.layers[0])).toContain('"ty":2'); // text on top, as a picture
		expect(json.assets).toHaveLength(1);

		const { project: back, warnings } = lottieToMotion({ json: JSON.parse(JSON.stringify(json)) });
		expect(warnings).toEqual([]);
		expect(back.layers.map((l) => l.kind)).toEqual(["rect", "rect", "path", "image"]);
		const r = back.layers[1];
		expect(r.kind === "rect" && r.radius).toBe(12);
		expect(r.rotation).toBe(15);
		expect(valueAt({ layer: r, prop: "x", t: 0.5 })).toBeCloseTo(valueAt({ layer: rect, prop: "x", t: 0.5 }), 1);
		expect(r.keyframes.x?.[0].ease).toEqual(EASES.easeOut);
		const s = back.layers[2];
		const b0 = layerBounds({ layer: star, t: 0 });
		const b1 = layerBounds({ layer: s, t: 0 });
		expect(b1.left).toBeCloseTo(b0.left, 1);
		expect(b1.bottom).toBeCloseTo(b0.bottom, 1);
	});

	test("imports a real Lottie file and reports what it left out", () => {
		const file = path.join(import.meta.dir, "../../../public/brand/frameflow-loader.json");
		const { project, warnings } = lottieToMotion({ json: JSON.parse(fs.readFileSync(file, "utf8")) });
		expect(project.width).toBeGreaterThan(0);
		expect(project.layers.length).toBeGreaterThan(0);
		expect(Array.isArray(warnings)).toBe(true);
	});
});

describe("animated pictures in Lottie", () => {
	test("a GIF layer becomes a looping pre-composition of its frames", async () => {
		const project = createMotionProject({ width: 400, height: 400, fps: 10, duration: 3 });
		project.layers = [
			{ id: "g", name: "Gif", visible: true, locked: false, x: 200, y: 200, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, keyframes: {}, kind: "image", src: "data:image/gif;base64,AA", w: 100, h: 100 },
		];
		const json = await motionToLottie({
			project,
			rasterizeText,
			animatedFrames: async () => ({ frames: [0, 0.5].map((start, i) => ({ src: `data:image/png;base64,F${i}`, start })), duration: 1, width: 50, height: 50 }),
		});
		const comps = (json.assets ?? []).filter((a) => JSON.stringify(a).includes('"layers"'));
		expect(comps).toHaveLength(1);
		// 3 s of a 1 s loop: three pre-comp layers starting at 0, 10 and 20.
		const loops = json.layers.map((l) => JSON.parse(JSON.stringify(l))).filter((l) => l.ty === 0);
		expect(loops.map((l) => l.st)).toEqual([0, 10, 20]);
	});
});
