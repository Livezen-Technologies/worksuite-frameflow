import type { EditorCore } from "@/core";
import { windowsBridge } from "./bridge";
import { useWindowState } from "./store";

/**
 * Save before leaving a project. Autosave means this is normally instant;
 * only a failed save asks Save again / Don't save / Cancel (MP-11).
 */
export async function leaveProject({
	editor,
	then,
}: {
	editor: EditorCore;
	then: () => void;
}): Promise<void> {
	const project = editor.project.getActiveOrNull();
	if (!project || !editor.save.getIsDirty()) return then();
	try {
		await editor.save.flush();
		then();
	} catch (error) {
		useWindowState.getState().set({
			saveFailed: {
				projectId: project.metadata.id,
				error: error instanceof Error ? error.message : String(error),
				then,
			},
		});
	}
}

/** Move the open project to a window of its own (MP-04). */
export async function openInNewWindow({
	editor,
	projectId,
	goToProjects,
	at,
}: {
	editor: EditorCore;
	projectId: string;
	goToProjects: () => void;
	at?: { x: number; y: number };
}) {
	const bridge = windowsBridge();
	if (!bridge) return;
	const showingHere =
		editor.project.getActiveOrNull()?.metadata.id === projectId;
	if (showingHere) {
		await leaveProject({ editor, then: goToProjects });
		await bridge.report({ projectId: null });
	}
	await bridge.open({ projectId, at });
}
