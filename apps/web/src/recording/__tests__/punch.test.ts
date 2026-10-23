/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- partial timeline fixtures */
import { describe, expect, test } from "bun:test";
import type { SceneTracks, UploadAudioElement } from "@/timeline/types";
import { punchIn, withTake } from "../punch";

const audio = (over: Partial<UploadAudioElement>) =>
	({ id: "a", type: "audio", sourceType: "upload", mediaId: "vo", name: "VO", startTime: 0, duration: 10_000, trimStart: 0, trimEnd: 0, params: { volume: -3 }, ...over }) as UploadAudioElement;
const tracks = (elements: UploadAudioElement[]) =>
	({ main: { id: "main", type: "video", elements: [] }, overlay: [], audio: [{ id: "t", type: "audio", name: "A", muted: false, elements }] }) as unknown as SceneTracks;
const row = (e: UploadAudioElement) => [e.id, Number(e.startTime), Number(e.duration), e.mediaId, Number(e.trimStart), Number(e.trimEnd)];

describe("punch-in and takes", () => {
	test("replaces only the range and keeps what it covered as take 1", () => {
		let n = 0;
		const result = punchIn({
			tracks: tracks([audio({})]),
			start: 3000,
			end: 5000,
			take: { element: audio({ id: "new", mediaId: "r1", duration: 2200, params: {} }), length: 2200 },
			makeId: () => `n${n++}`,
		})!;
		const els = result.tracks.audio[0]!.elements as UploadAudioElement[];
		expect(els.map(row)).toEqual([
			["a", 0, 3000, "vo", 0, 7000],
			["n0", 3000, 2000, "r1", 0, 200],
			["n1", 5000, 5000, "vo", 5000, 0],
		]);
		const take = els[1]!;
		expect(take.takes!.map((t) => [t.label, t.mediaId, Number(t.trimStart), Number(t.trimEnd)])).toEqual([
			["Take 1", "vo", 3000, 5000],
			["Take 2", "r1", 0, 200],
		]);
		expect(take.params.volume).toBe(-3);
		// Again over the same range: a third take on the same clip.
		const again = punchIn({
			tracks: result.tracks,
			start: 3000,
			end: 5000,
			take: { element: audio({ id: "x", mediaId: "r2", duration: 2000 }), length: 2000 },
			makeId: () => `n${n++}`,
		})!;
		const clip = again.tracks.audio[0]!.elements.find((e) => e.id === "n0") as UploadAudioElement;
		expect(again.elementId).toBe("n0");
		expect([clip.takes!.length, clip.activeTake, clip.mediaId]).toEqual([3, 2, "r2"]);
		expect(withTake({ element: clip, index: 0 }).mediaId).toBe("vo");
	});

	test("no sound in the range: nothing to punch into", () => {
		expect(
			punchIn({ tracks: tracks([audio({ duration: 1000 })]), start: 3000, end: 5000, take: { element: audio({}), length: 1 }, makeId: () => "z" }),
		).toBeNull();
	});
});
