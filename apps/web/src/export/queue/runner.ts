import type { EditorCore } from "@/core";
import { downloadBuffer, getExportMimeType } from "@/export";
import { nextRunnable, useExportQueue } from "./store";

let running = false;

/**
 * Runs queued exports one after another (EX-14). Jobs belong to a project
 * and run while it's open; the desktop app saves them straight into
 * Videos/Worksuite without asking for each file.
 */
export async function runExportQueue({ editor }: { editor: EditorCore }) {
	if (running) return;
	running = true;
	try {
		for (;;) {
			const queue = useExportQueue.getState();
			const job = nextRunnable({
				jobs: queue.jobs,
				activeProjectId: editor.project.getActiveOrNull()?.metadata.id ?? null,
			});
			if (!job) return;
			queue.update({
				id: job.id,
				patch: { status: "running", progress: 0, attempts: job.attempts + 1 },
			});
			const unsubscribe = editor.project.subscribe(() => {
				const { progress } = editor.project.getExportState();
				useExportQueue.getState().update({ id: job.id, patch: { progress } });
			});
			try {
				if (
					job.sceneId &&
					editor.scenes.getActiveSceneOrNull()?.id !== job.sceneId
				)
					await editor.scenes.switchToScene({ sceneId: job.sceneId });
				const result = await editor.project.export({ options: job.options });
				editor.project.clearExportState();
				if (result.cancelled) {
					queue.update({ id: job.id, patch: { status: "cancelled" } });
					continue;
				}
				if (!result.success || !result.buffer)
					throw new Error(result.error || "The export didn't finish.");
				const files = window.worksuite?.files;
				const master = window.worksuite?.master;
				let path: string | undefined;
				if (result.masterJobId && master) {
					const saved = await master.save({
						id: result.masterJobId,
						suggestedName: job.fileName,
						toFolder: true,
					});
					path = saved.path;
				} else if (files?.saveToFolder) {
					const saved = await files.saveToFolder({
						fileName: job.fileName,
						data: result.buffer,
					});
					path = saved.path;
				} else {
					downloadBuffer({
						buffer: result.buffer,
						filename: job.fileName,
						mimeType: getExportMimeType({ format: job.options.format }),
					});
				}
				queue.update({
					id: job.id,
					patch: { status: "done", progress: 1, ...(path ? { path } : {}) },
				});
			} catch (error) {
				queue.update({
					id: job.id,
					patch: {
						status: "failed",
						error: error instanceof Error ? error.message : String(error),
					},
				});
			} finally {
				unsubscribe();
			}
		}
	} finally {
		running = false;
	}
}

/** Cancels a job: a running one stops its export, a queued one is skipped. */
export function cancelExportJob({
	editor,
	id,
}: {
	editor: EditorCore;
	id: string;
}) {
	const job = useExportQueue.getState().jobs.find((j) => j.id === id);
	if (!job) return;
	if (job.status === "running") editor.project.cancelExport();
	else if (job.status === "queued")
		useExportQueue.getState().update({ id, patch: { status: "cancelled" } });
}
