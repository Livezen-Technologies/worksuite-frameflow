import { describe, expect, test } from "bun:test";
import {
	buildManifest,
	buildMediaIndex,
	entryFileName,
	FolderFormatError,
	mediaFileName,
	parseManifest,
	parseMediaIndex,
	planRelink,
	type FolderMediaEntry,
} from "../format";
import type { SerializedProject } from "@/services/storage/types";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal fixture
const project = {
	metadata: { id: "p1", name: "Film", createdAt: "x", updatedAt: "x" },
	scenes: [],
	currentSceneId: "s",
	settings: {},
	version: 1,
} as unknown as SerializedProject;

const entry = (over: Partial<FolderMediaEntry>): FolderMediaEntry => ({
	id: "abcdef1234",
	name: "clip.mp4",
	type: "video",
	size: 100,
	lastModified: 1,
	file: "media/abcdef12-clip.mp4",
	...over,
});

describe("project folder format", () => {
	test("manifest round-trips and rejects other files", () => {
		expect(parseManifest(buildManifest({ project })).metadata.id).toBe("p1");
		expect(() => parseManifest("{}")).toThrow(FolderFormatError);
		expect(() => parseManifest("not json")).toThrow(FolderFormatError);
		expect(() =>
			parseManifest(
				JSON.stringify({ format: "frameflow-project", version: 99, project }),
			),
		).toThrow(/newer version/);
	});

	test("media file names are safe and relative", () => {
		expect(mediaFileName({ id: "abcdef1234", name: "../../etc/passwd" })).toBe(
			"abcdef12-_.._etc_passwd",
		);
		expect(mediaFileName({ id: "abcdef1234", name: 'a:b?"c.mp4' })).toBe(
			"abcdef12-a_b__c.mp4",
		);
		const [item] = buildMediaIndex({
			media: [
				{
					id: "abcdef1234",
					name: "clip.mp4",
					type: "video",
					size: 1,
					lastModified: 1,
					thumbnailUrl: "blob:x",
				},
			],
		});
		expect(item.file).toBe("media/abcdef12-clip.mp4");
		expect(item.thumbnailUrl).toBeUndefined();
		expect(entryFileName(item)).toBe("abcdef12-clip.mp4");
	});

	test("ephemeral media stays out; junk index entries are dropped", () => {
		expect(
			buildMediaIndex({
				media: [
					{
						id: "a",
						name: "x",
						type: "image",
						size: 1,
						lastModified: 1,
						ephemeral: true,
					},
				],
			}),
		).toEqual([]);
		expect(
			parseMediaIndex(JSON.stringify([entry({}), { id: 3 }])),
		).toHaveLength(1);
		expect(parseMediaIndex("oops")).toEqual([]);
	});

	test("relink matches by name, then by size", () => {
		const a = entry({ id: "a", name: "Beach.MOV", size: 10 });
		const b = entry({ id: "b", name: "drone.mp4", size: 20 });
		const plan = planRelink({
			missing: [a, b],
			picked: [
				{ name: "renamed.mp4", size: 20 },
				{ name: "beach.mov", size: 999 },
			],
		});
		expect(plan.get("a")).toBe(1);
		expect(plan.get("b")).toBe(0);
	});
});
