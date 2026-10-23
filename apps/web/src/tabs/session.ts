"use client";

import type { EditorCore } from "@/core";
import { allowHistoryWrites, restorePersistedHistory } from "@/history/persist";
import { tabSessions } from "./store";

/** Keeps the leaving project's undo history, playhead and selection. */
export function saveTabSession({
	editor,
	projectId,
}: {
	editor: EditorCore;
	projectId: string;
}) {
	if (editor.project.getActiveOrNull()?.metadata.id !== projectId) {
		editor.command.restoreHistory(null);
		return;
	}
	if (editor.playback.getIsPlaying()) editor.playback.pause();
	tabSessions.set(projectId, {
		history: editor.command.takeHistory(),
		playhead: editor.playback.getCurrentTime(),
		selection: editor.selection.getSelectedElements(),
	});
}

export function restoreTabSession({
	editor,
	projectId,
}: {
	editor: EditorCore;
	projectId: string;
}) {
	const session = tabSessions.get(projectId);
	editor.command.restoreHistory(session?.history ?? null);
	// First open since the app started: undo history from disk (ED-16).
	if (!session) {
		void restorePersistedHistory({ editor, projectId });
		return;
	}
	allowHistoryWrites(projectId);
	editor.playback.seek({ time: session.playhead });
	editor.selection.setSelectedElements({ elements: session.selection });
}
