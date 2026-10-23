import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { injectSphericalMetadata } from "../inject";
import {
	nearestYaw,
	projectionFromParams,
	REFRAME_EFFECT_TYPE,
	withoutReframe,
	withReframe,
} from "../projection";
import {
	detectSphere,
	hasSphereShape,
	hasSphericalMetadata,
	unsupportedSphereFormat,
} from "../spherical";

const fixture = (name: string) =>
	new Uint8Array(readFileSync(join(import.meta.dir, "fixtures", name)));

/** Top-level boxes and the offsets in the video track's stco. */
function summarize(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const top: string[] = [];
	for (let o = 0; o + 8 <= bytes.length; ) {
		const size = view.getUint32(o);
		top.push(String.fromCharCode(...bytes.subarray(o + 4, o + 8)));
		o += size;
	}
	const offsets: number[] = [];
	const text = new TextDecoder("latin1").decode(bytes);
	let at = text.indexOf("stco");
	while (at >= 0) {
		const count = view.getUint32(at + 8);
		offsets.push(
			...Array.from({ length: count }, (_, i) =>
				view.getUint32(at + 12 + i * 4),
			),
		);
		at = text.indexOf("stco", at + 4);
	}
	return { top, offsets };
}

describe("360° metadata injection", () => {
	for (const name of ["flat-end.mp4", "flat-faststart.mp4"]) {
		test(`adds V1 and V2 metadata (${name})`, () => {
			const input = fixture(name);
			expect(hasSphericalMetadata(input)).toBe(false);
			const output = injectSphericalMetadata(input);
			expect(hasSphericalMetadata(output)).toBe(true);
			const text = new TextDecoder("latin1").decode(output);
			for (const box of ["st3d", "sv3d", "svhd", "proj", "prhd", "equi"]) {
				expect(text.includes(box)).toBe(true);
			}
			expect(summarize(output).top).toEqual(summarize(input).top);
		});
	}

	test("keeps chunk offsets pointing at the same media", () => {
		for (const name of ["flat-end.mp4", "flat-faststart.mp4"]) {
			const input = fixture(name);
			const output = injectSphericalMetadata(input);
			const before = summarize(input).offsets;
			const after = summarize(output).offsets;
			expect(after.length).toBe(before.length);
			after.forEach((offset, i) => {
				const was = before[i] ?? 0;
				expect([...output.subarray(offset, offset + 16)]).toEqual([
					...input.subarray(was, was + 16),
				]);
			});
		}
	});

	test("running twice doesn't duplicate the metadata", () => {
		const once = injectSphericalMetadata(fixture("flat-end.mp4"));
		const twice = injectSphericalMetadata(once);
		expect(twice.length).toBe(once.length);
	});
});

describe("360° detection", () => {
	test("by metadata, by shape, and unsupported camera files", () => {
		const v2 = injectSphericalMetadata(fixture("flat-end.mp4"));
		expect(
			detectSphere({ fileName: "a.mp4", head: v2, tail: new Uint8Array() }),
		).toEqual({ is360: true, source: "metadata" });
		expect(hasSphereShape({ width: 5760, height: 2880 })).toBe(true);
		expect(hasSphereShape({ width: 1920, height: 1080 })).toBe(false);
		expect(hasSphereShape({ width: 640, height: 320 })).toBe(false);
		expect(
			detectSphere({
				fileName: "b.mp4",
				head: new Uint8Array(),
				tail: new Uint8Array(),
				width: 3840,
				height: 1920,
			}).source,
		).toBe("shape");
		expect(unsupportedSphereFormat("VID_001.insv")).toContain(
			"Insta360 Studio",
		);
		expect(unsupportedSphereFormat("GS010001.360")).toContain("GoPro Player");
		expect(unsupportedSphereFormat("clip.mp4")).toBeNull();
	});
});

describe("virtual camera", () => {
	test("reads params with defaults and limits", () => {
		expect(
			projectionFromParams({ yaw: 400, pitch: 120, mode: "sphere" }),
		).toEqual({
			yaw: 400,
			pitch: 90,
			roll: 0,
			fov: 90,
			lens: 0,
			equirectangular: true,
		});
	});

	test("turns the short way across the seam", () => {
		expect(nearestYaw({ from: 170, target: -170 })).toBe(190);
		expect(nearestYaw({ from: -175, target: 175 })).toBe(-185);
		expect(nearestYaw({ from: 10, target: 20 })).toBe(20);
		expect(nearestYaw({ from: 725, target: 0 })).toBe(720);
	});

	test("goes first in the effect stack, once", () => {
		let id = 0;
		const makeId = () => `e${++id}`;
		const existing = [{ id: "x", type: "vignette", enabled: true, params: {} }];
		const added = withReframe({ effects: existing, makeId });
		expect(added.map((e) => e.type)).toEqual([REFRAME_EFFECT_TYPE, "vignette"]);
		expect(withReframe({ effects: added, makeId })).toBe(added);
		expect(withoutReframe(added)).toEqual(existing);
	});
});
