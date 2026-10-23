import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline/types";
import { historyToRestore, persistableHistory, PERSISTED_STEPS } from "../persisted";

const t = (n: number) => ({ main: { id: `m${n}` }, overlay: [], audio: [] }) as unknown as SceneTracks;
const step = (n: number, sceneId = "s") => ({ sceneId, before: t(n), after: t(n + 1) });

describe("undo after restart (ED-16)", () => {
	test("keeps the newest run of timeline steps on one scene", () => {
		const saved = persistableHistory({ projectId: "p", history: [step(0), null, step(1), step(2)], redo: [step(3)], now: 1 });
		expect(saved?.undo.map((s) => s.before)).toEqual([t(1), t(2)]);
		expect(saved?.redo).toHaveLength(1);
		const otherScene = persistableHistory({ projectId: "p", history: [step(0, "x"), step(1)], redo: [] });
		expect(otherScene?.undo).toHaveLength(1);
		expect(persistableHistory({ projectId: "p", history: [null], redo: [] })).toBeNull();
	});

	test("caps the number of steps", () => {
		const many = Array.from({ length: PERSISTED_STEPS + 10 }, (_, i) => step(i));
		expect(persistableHistory({ projectId: "p", history: many, redo: [] })?.undo).toHaveLength(PERSISTED_STEPS);
	});

	test("restores only when the project opens as the history left it", () => {
		const saved = persistableHistory({ projectId: "p", history: [step(0), step(1)], redo: [] });
		expect(historyToRestore({ saved, sceneId: "s", tracks: t(2) })).toBe(saved);
		expect(historyToRestore({ saved, sceneId: "s", tracks: t(1) })).toBeNull();
		expect(historyToRestore({ saved, sceneId: "other", tracks: t(2) })).toBeNull();
		const onlyRedo = persistableHistory({ projectId: "p", history: [], redo: [step(5)] });
		expect(historyToRestore({ saved: onlyRedo, sceneId: "s", tracks: t(5) })).toBe(onlyRedo);
	});
});
