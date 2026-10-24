import { describe, expect, test } from "bun:test";
import {
	copyKeyframes,
	createLayer,
	createMotionProject,
	EASES,
	moveKeyframes,
	pasteKeyframes,
	playbackTime,
	setKeyEase,
	setKeyframe,
} from "../model";

const project = createMotionProject();
const base = () => {
	let layer = createLayer({ kind: "rect", project });
	layer = setKeyframe({ layer, prop: "x", t: 0, v: 0 });
	layer = setKeyframe({ layer, prop: "x", t: 1, v: 100 });
	layer = setKeyframe({ layer, prop: "x", t: 2, v: 200 });
	return layer;
};

describe("playback modes", () => {
	const settings = { mode: "loop" as const, reverse: false, speed: 1 };
	test("loop, once, bounce, reverse and speed", () => {
		expect(playbackTime({ elapsed: 7, duration: 5, settings }).t).toBeCloseTo(2);
		expect(playbackTime({ elapsed: 7, duration: 5, settings: { ...settings, mode: "once" } })).toEqual({ t: 5, done: true });
		expect(playbackTime({ elapsed: 7, duration: 5, settings: { ...settings, mode: "bounce" } }).t).toBeCloseTo(3);
		expect(playbackTime({ elapsed: 1, duration: 5, settings: { ...settings, reverse: true } }).t).toBeCloseTo(4);
		expect(playbackTime({ elapsed: 1, duration: 5, settings: { ...settings, speed: 2 } }).t).toBeCloseTo(2);
	});
});

describe("keyframe editing", () => {
	test("moving keeps keys inside the duration and replaces collisions", () => {
		const layer = base();
		const { layers, keys } = moveKeyframes({ layers: [layer], keys: [{ layerId: layer.id, prop: "x", t: 1 }], dt: 5, duration: 3 });
		expect(layers[0].keyframes.x?.map((k) => k.t)).toEqual([0, 2, 3]);
		expect(keys[0].t).toBe(3);
		const onto = moveKeyframes({ layers: [layer], keys: [{ layerId: layer.id, prop: "x", t: 1 }], dt: 1, duration: 3 });
		expect(onto.layers[0].keyframes.x?.map((k) => [k.t, k.v])).toEqual([
			[0, 0],
			[2, 100],
		]);
	});

	test("copy and paste at the playhead, to the same or another layer", () => {
		const layer = base();
		const other = createLayer({ kind: "ellipse", project });
		const copied = copyKeyframes({ layers: [layer], keys: [{ layerId: layer.id, prop: "x", t: 1 }, { layerId: layer.id, prop: "x", t: 2 }] });
		expect(copied.map((c) => c.offset)).toEqual([0, 1]);
		const pasted = pasteKeyframes({ layers: [layer, other], copied, t: 3, duration: 10, target: other.id });
		expect(pasted.layers[1].keyframes.x?.map((k) => [k.t, k.v])).toEqual([
			[3, 100],
			[4, 200],
		]);
		expect(pasted.layers[0]).toBe(layer);
	});

	test("easing applies to the chosen keys", () => {
		const layer = base();
		const [out] = setKeyEase({ layers: [layer], keys: [{ layerId: layer.id, prop: "x", t: 1 }], ease: EASES.linear });
		expect(out.keyframes.x?.map((k) => k.ease)).toEqual([EASES.easeInOut, EASES.linear, EASES.easeInOut]);
	});
});
