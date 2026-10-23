"use client";

import type { EditorCore } from "@/core";
import { TracksSnapshotCommand } from "@/commands/timeline/tracks-snapshot";
import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import { historyToRestore, persistableHistory, type PersistedHistory } from "./persisted";

const store = new IndexedDBAdapter<PersistedHistory>({
	dbName: "frameflow-undo-history",
	storeName: "history",
});

const SAVE_DELAY_MS = 800;
let started = false;
/** Project whose history may be written; null while it is being restored. */
let writable: string | null = null;

/** Keeps each project's timeline undo history on disk (SRS ED-16). */
function startPersisting(editor: EditorCore) {
	if (started) return;
	started = true;
	let timer: ReturnType<typeof setTimeout> | null = null;
	editor.command.onHistoryChange(() => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			const projectId = editor.project.getActiveOrNull()?.metadata.id;
			if (!projectId || projectId !== writable) return;
			const saved = persistableHistory({ projectId, ...editor.command.tracksSteps() });
			void (saved ? store.set({ key: projectId, value: saved }) : store.remove(projectId)).catch(() => {});
		}, SAVE_DELAY_MS);
	});
}

/** After a restart: bring back the project's undo history if it still fits. */
export async function restorePersistedHistory({
	editor,
	projectId,
}: {
	editor: EditorCore;
	projectId: string;
}) {
	startPersisting(editor);
	writable = null;
	try {
		const scene = editor.scenes.getActiveSceneOrNull();
		const saved = await store.get(projectId).catch(() => null);
		if (!scene || editor.project.getActiveOrNull()?.metadata.id !== projectId) return;
		const fits = historyToRestore({ saved, sceneId: scene.id, tracks: scene.tracks });
		if (fits && !editor.command.canUndo() && !editor.command.canRedo()) {
			const step = (s: PersistedHistory["undo"][number]) => ({ sceneId: fits.sceneId, ...s });
			editor.command.restoreSteps({
				history: fits.undo.map(step),
				redo: fits.redo.map(step),
				makeCommand: (s) => new TracksSnapshotCommand({ before: s.before, after: s.after }),
			});
		}
	} finally {
		if (editor.project.getActiveOrNull()?.metadata.id === projectId) writable = projectId;
	}
}

/** Tab switches keep history in memory; writes go to the tab now shown. */
export function allowHistoryWrites(projectId: string) {
	writable = projectId;
}
