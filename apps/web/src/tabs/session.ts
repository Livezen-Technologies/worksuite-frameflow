"use client";

import type { EditorCore } from "@/core";
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
	if (!session) return;
	editor.playback.seek({ time: session.playhead });
	editor.selection.setSelectedElements({ elements: session.selection });
}
