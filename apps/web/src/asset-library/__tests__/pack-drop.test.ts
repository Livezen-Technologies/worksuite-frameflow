import { describe, expect, test } from "bun:test";
import { Command } from "@/commands/base-command";
import { CommandManager } from "@/core/managers/commands";
import { finishedPlaceholders, runPackDrop, usePackDrops, type PackDropDeps, type PackDropRequest } from "../pack-drop";

/*
 * The placeholder / install / swap flow with a fake timeline (a list of
 * clip ids) and the real CommandManager, to check that a drop is exactly
 * one undo step and that cancelling leaves no trace.
 */

function fakeEditor() {
	const tracks = { clips: [] as string[] };
	const editor = {
		scenes: { getActiveSceneOrNull: () => null },
		selection: { getSnapshot: () => ({}), applySelectionPatch: () => ({}), restoreSnapshot: () => {} },
	};
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a minimal fake editor for the history
	const history = new CommandManager(editor as never);
	class AddClip extends Command {
		constructor(private id: string) {
			super();
		}
		execute() {
			tracks.clips.push(this.id);
			return undefined;
		}
		undo() {
			tracks.clips = tracks.clips.filter((c) => c !== this.id);
		}
	}
	const run = (id: string) => history.execute({ command: new AddClip(id) });
	return { tracks, history, run };
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const request: PackDropRequest = { packId: "film-luts", packType: "graphics", title: "Film", target: { kind: "default" } };

function setup() {
	const env = fakeEditor();
	const install = deferred<boolean>();
	let cancelled = 0;
	const deps: PackDropDeps = {
		insertPlaceholder: () => {
			env.tracks.clips.push("placeholder");
			return { trackId: "t1", elementId: "placeholder", newTrack: false };
		},
		removePlaceholder: () => {
			env.tracks.clips = env.tracks.clips.filter((c) => c !== "placeholder");
		},
		install: () => install.promise,
		cancelInstall: () => {
			cancelled += 1;
		},
		history: { mark: () => env.history.mark(), squash: (a) => env.history.squash(a) },
		// The real add takes several commands (media, clip, sound).
		perform: async () => {
			env.run("media");
			await Promise.resolve();
			env.run("clip");
			env.run("sound");
		},
	};
	return { ...env, install, deps, cancelledCount: () => cancelled };
}

describe("dropping a pack that isn't installed", () => {
	test("placeholder now, real clip on install, ONE undo step", async () => {
		const s = setup();
		s.run("earlier");
		const drop = runPackDrop({ request, deps: s.deps });
		expect(s.tracks.clips).toEqual(["earlier", "placeholder"]);
		expect(s.history.canUndo()).toBe(true);
		// The placeholder is not an undo step.
		expect(s.history.mark()).toBe(1);
		const view = Object.values(usePackDrops.getState().drops).find((d) => d.id === drop.id);
		expect(view?.ring?.elementId).toBe("placeholder");

		s.install.resolve(true);
		expect(await drop.done).toBe("added");
		expect(s.tracks.clips).toEqual(["earlier", "media", "clip", "sound"]);
		expect(s.history.mark()).toBe(2);
		expect(usePackDrops.getState().drops[drop.id]).toBeUndefined();

		s.history.undo();
		expect(s.tracks.clips).toEqual(["earlier"]);
		s.history.redo();
		expect(s.tracks.clips).toEqual(["earlier", "media", "clip", "sound"]);
		s.history.undo();
		s.history.undo();
		expect(s.tracks.clips).toEqual([]);
		expect(finishedPlaceholders.has("placeholder")).toBe(true);
	});

	test("edits made while it downloads stay their own steps", async () => {
		const s = setup();
		const drop = runPackDrop({ request, deps: s.deps });
		s.run("user-edit");
		s.install.resolve(true);
		await drop.done;
		expect(s.history.mark()).toBe(2);
		s.history.undo();
		expect(s.tracks.clips).toEqual(["user-edit"]);
	});

	test("cancel removes the placeholder and leaves no undo step", async () => {
		const s = setup();
		const drop = runPackDrop({ request, deps: s.deps });
		drop.cancel();
		expect(s.tracks.clips).toEqual([]);
		expect(s.cancelledCount()).toBe(1);
		s.install.resolve(true);
		expect(await drop.done).toBe("cancelled");
		expect(s.tracks.clips).toEqual([]);
		expect(s.history.canUndo()).toBe(false);
	});

	test("a download cancelled elsewhere (install resolves false) removes the placeholder", async () => {
		const s = setup();
		const drop = runPackDrop({ request, deps: s.deps });
		s.install.resolve(false);
		expect(await drop.done).toBe("cancelled");
		expect(s.tracks.clips).toEqual([]);
		expect(s.history.canUndo()).toBe(false);
	});

	test("a failed download removes the placeholder and reports the error", async () => {
		const s = setup();
		const errors: unknown[] = [];
		const drop = runPackDrop({ request, deps: { ...s.deps, onError: (e) => errors.push(e) } });
		s.install.reject(Object.assign(new Error("limit"), { code: "device-limit" }));
		expect(await drop.done).toBe("failed");
		expect(s.tracks.clips).toEqual([]);
		expect(errors[0]).toMatchObject({ code: "device-limit" });
		expect(s.history.canUndo()).toBe(false);
	});

	test("LUTs, filters and transitions get a ring on their target, not a placeholder clip", async () => {
		const s = setup();
		const drop = runPackDrop({
			request: { ...request, packType: "luts", placeholder: false, target: { kind: "clip", trackId: "t1", elementId: "clip-a" } },
			deps: s.deps,
		});
		expect(s.tracks.clips).toEqual([]);
		expect(usePackDrops.getState().drops[drop.id]?.ring).toEqual({ trackId: "t1", elementId: "clip-a" });
		s.install.resolve(true);
		await drop.done;
		expect(s.history.mark()).toBe(1);
	});
});
