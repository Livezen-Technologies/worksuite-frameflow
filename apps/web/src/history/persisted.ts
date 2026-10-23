/**
 * Undo history that survives a restart (SRS ED-16). Timeline steps are kept
 * as the tracks before and after each one, so they can be rebuilt as
 * snapshot commands after the project is opened again.
 */
import type { SceneTracks } from "@/timeline/types";

export interface TracksStep {
	sceneId: string;
	before: SceneTracks;
	after: SceneTracks;
}

export interface PersistedHistory {
	/** Project id (the store's key). */
	id: string;
	sceneId: string;
	/** Oldest first, like the command history. */
	undo: { before: SceneTracks; after: SceneTracks }[];
	redo: { before: SceneTracks; after: SceneTracks }[];
	savedAt: number;
}

export const PERSISTED_STEPS = 50;

/**
 * The steps that can be kept: the newest run of timeline steps on one scene.
 * A step that isn't a timeline step (or is on another scene) ends the run,
 * since undoing past it wouldn't restore what the user saw.
 */
export function persistableHistory({
	projectId,
	history,
	redo,
	now = Date.now(),
}: {
	projectId: string;
	history: (TracksStep | null)[];
	redo: (TracksStep | null)[];
	now?: number;
}): PersistedHistory | null {
	const sceneId = history.at(-1)?.sceneId ?? redo.at(-1)?.sceneId;
	if (!sceneId) return null;
	const run = (list: (TracksStep | null)[]) => {
		const out: { before: SceneTracks; after: SceneTracks }[] = [];
		for (let i = list.length - 1; i >= 0 && out.length < PERSISTED_STEPS; i--) {
			const step = list[i];
			if (!step || step.sceneId !== sceneId) break;
			out.unshift({ before: step.before, after: step.after });
		}
		return out;
	};
	const undo = run(history);
	const redoSteps = run(redo);
	if (!undo.length && !redoSteps.length) return null;
	return { id: projectId, sceneId, undo, redo: redoSteps, savedAt: now };
}

const same = ({ a, b }: { a: SceneTracks; b: SceneTracks }) =>
	JSON.stringify(a) === JSON.stringify(b);

/**
 * The steps to bring back, if the project opened as the history left it: the
 * newest undo step's result (or the redo step's start) must match the
 * scene's tracks, or the history no longer fits and is dropped.
 */
export function historyToRestore({
	saved,
	sceneId,
	tracks,
}: {
	saved: PersistedHistory | null;
	sceneId: string;
	tracks: SceneTracks;
}): PersistedHistory | null {
	if (!saved || saved.sceneId !== sceneId) return null;
	const top = saved.undo.at(-1);
	const next = saved.redo.at(-1);
	if (top ? !same({ a: top.after, b: tracks }) : !next || !same({ a: next.before, b: tracks }))
		return null;
	return saved;
}
