import { describe, expect, test } from "bun:test";
import { parseProjectTemplate } from "@/asset-library/pack-items";
import { useMyProjectTemplates } from "../my-templates";
import { PROJECT_TEMPLATES } from "../project-templates";
import { filterTemplates, mediaClips, projectToTemplate, templateSection, type SourceTrack } from "../save-template";

const TPS = 120_000;
const s = (sec: number) => sec * TPS;

const tracks: SourceTrack[] = [
	{
		type: "video",
		elements: [
			{ id: "v1", type: "video", name: "beach.mp4", mediaId: "m1", startTime: 0, duration: s(3), params: {} },
			{ id: "i1", type: "image", name: "sunset.jpg", mediaId: "m2", startTime: s(3), duration: s(2), params: {}, transitionIn: { type: "cross-dissolve" } },
			{ id: "v2", type: "video", name: "beach.mp4 again", mediaId: "m1", startTime: s(5), duration: s(1), params: {} },
		],
	},
	{ type: "audio", elements: [{ id: "a1", type: "audio", name: "song", startTime: 0, duration: s(6), params: {} }] },
	{
		type: "text",
		elements: [{ id: "t1", type: "text", name: "Title", startTime: s(0.5), duration: s(4), params: { content: "Hello Lanka", fontFamily: "Inter", fontSize: 40, color: "#fff", "transform.positionX": 0, "transform.positionY": -270 } }],
	},
	{
		type: "graphic",
		elements: [
			{ id: "g1", type: "graphic", name: "Bar", definitionId: "rectangle", startTime: 0, duration: s(6), params: { fill: "#E11D48", "transform.scaleX": 1, "transform.scaleY": 0.1, "transform.positionY": 480 } },
			{ id: "g2", type: "graphic", name: "Lottie", definitionId: "lottie", lottie: {}, startTime: 0, duration: s(2), params: {} },
		],
	},
];

const input = { name: " Beach reel ", category: "Social" as const, description: "Summer", canvas: { width: 1920, height: 1080 }, tracks, ticksPerSecond: TPS, now: 1_700_000_000_000 };

describe("save project as template", () => {
	test("media become slots (same media → same slot), text keeps its look, shapes stay, the rest is left out", () => {
		const t = projectToTemplate(input)!;
		expect(t.name).toBe("Beach reel");
		expect(t.aspect).toEqual({ label: "16:9", width: 1920, height: 1080 });
		expect(t.source).toEqual({ kind: "user" });
		expect(t.layers.map((l) => l.kind)).toEqual(["media", "media", "media", "text", "shape"]);
		expect(t.layers.filter((l) => l.kind === "media").map((l) => (l.kind === "media" ? l.slot : -1))).toEqual([0, 1, 0]);
		expect(t.layers[1]).toMatchObject({ start: 3, duration: 2, transitionIn: "cross-dissolve" });
		expect(t.layers[3]).toMatchObject({ kind: "text", content: "Hello Lanka", y: -0.25, start: 0.5, duration: 4, style: { fontFamily: "Inter", fontSize: 40, color: "#fff" } });
		expect(t.layers[4]).toMatchObject({ kind: "shape", fill: "#E11D48", height: 0.1, y: 0.444 });
	});

	test("unticked media are left out; an empty project saves nothing", () => {
		const t = projectToTemplate({ ...input, exclude: ["i1"] })!;
		expect(t.layers.filter((l) => l.kind === "media")).toHaveLength(2);
		expect(mediaClips(tracks).map((m) => m.id)).toEqual(["v1", "i1", "v2"]);
		expect(projectToTemplate({ ...input, tracks: [] })).toBeNull();
	});

	test("round trip: the saved recipe survives storage and the template checker unchanged", () => {
		const saved = projectToTemplate({ ...input, thumbnail: "data:image/jpeg;base64,AAA" })!;
		const stored = JSON.parse(JSON.stringify(saved));
		const checked = parseProjectTemplate({ raw: stored, item: { id: saved.id, name: saved.name, url: "", packId: "local", raw: {} } });
		expect(checked?.layers).toEqual(saved.layers);
		expect(checked?.aspect).toEqual(saved.aspect);
		expect(stored.thumbnail).toBe("data:image/jpeg;base64,AAA");
	});

	test("My templates: add, rename, delete", () => {
		const store = useMyProjectTemplates;
		const saved = projectToTemplate(input)!;
		store.getState().add(saved);
		expect(store.getState().templates.map((t) => t.name)).toContain("Beach reel");
		store.getState().rename(saved.id, "Beach v2");
		expect(store.getState().templates.find((t) => t.id === saved.id)?.name).toBe("Beach v2");
		store.getState().rename(saved.id, "   ");
		expect(store.getState().templates.find((t) => t.id === saved.id)?.name).toBe("Beach v2");
		store.getState().remove(saved.id);
		expect(store.getState().templates.find((t) => t.id === saved.id)).toBeUndefined();
	});
});

describe("Templates panel sections", () => {
	const mine = projectToTemplate(input)!;
	const downloaded = { ...PROJECT_TEMPLATES[0]!, id: "pack/x", name: "Captions · Secret", source: { kind: "pack" as const, packId: "pack", packTitle: "Captions pack" } };
	const all = [...PROJECT_TEMPLATES, downloaded, mine];

	test("built-in, downloaded and mine are listed separately", () => {
		expect(templateSection(PROJECT_TEMPLATES[0]!)).toBe("built-in");
		expect(filterTemplates({ templates: all, section: "built-in", category: "All", query: "" })).toHaveLength(PROJECT_TEMPLATES.length);
		expect(filterTemplates({ templates: all, section: "downloaded", category: "All", query: "" }).map((t) => t.id)).toEqual(["pack/x"]);
		expect(filterTemplates({ templates: all, section: "mine", category: "All", query: "" }).map((t) => t.id)).toEqual([mine.id]);
	});

	test("category and search (including the pack name) apply within a section", () => {
		expect(filterTemplates({ templates: all, section: "mine", category: "Intro", query: "" })).toHaveLength(0);
		expect(filterTemplates({ templates: all, section: "downloaded", category: "All", query: "captions pack" })).toHaveLength(1);
		expect(filterTemplates({ templates: all, section: "built-in", category: "All", query: "travel" }).every((t) => /travel/i.test(`${t.name} ${t.description}`))).toBe(true);
	});
});
