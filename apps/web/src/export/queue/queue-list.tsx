"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEditor } from "@/editor/use-editor";
import { cancelExportJob, runExportQueue } from "./runner";
import { useExportQueue } from "./store";

const STATUS: Record<string, string> = {
	queued: "Waiting",
	running: "Exporting",
	done: "Saved",
	failed: "Failed",
	cancelled: "Cancelled",
};

/** Starts queued exports whenever their project is open (EX-14). */
export function ExportQueueHost() {
	const editor = useEditor();
	const projectId = useEditor(
		(e) => e.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const jobs = useExportQueue((s) => s.jobs);
	useEffect(() => {
		if (projectId) void runExportQueue({ editor });
	}, [editor, projectId, jobs]);
	return null;
}

export function ExportQueueList() {
	const editor = useEditor();
	const jobs = useExportQueue((s) => s.jobs);
	const retry = useExportQueue((s) => s.retry);
	const remove = useExportQueue((s) => s.remove);
	const clearFinished = useExportQueue((s) => s.clearFinished);
	if (jobs.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5 rounded-md border p-2" data-export-queue>
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium">Export queue</span>
				<Button size="sm" variant="ghost" className="h-6 text-xs" onClick={clearFinished}>
					Clear finished
				</Button>
			</div>
			{jobs.map((job) => (
				<div
					key={job.id}
					className="flex items-center gap-2 text-xs"
					data-export-job={job.status}
				>
					<span className="min-w-0 flex-1 truncate" title={job.error ?? job.path ?? job.fileName}>
						{job.fileName}
						{job.status === "failed" && job.error ? ` — ${job.error}` : ""}
					</span>
					{job.status === "running" ? (
						<Progress value={job.progress * 100} className="h-1.5 w-20" />
					) : (
						<span className="text-muted-foreground w-20 text-right">
							{STATUS[job.status]}
						</span>
					)}
					{job.status === "queued" || job.status === "running" ? (
						<Button
							size="sm"
							variant="outline"
							className="h-6 text-xs"
							onClick={() => cancelExportJob({ editor, id: job.id })}
						>
							Cancel
						</Button>
					) : job.status === "failed" || job.status === "cancelled" ? (
						<Button
							size="sm"
							variant="outline"
							className="h-6 text-xs"
							onClick={() => retry(job.id)}
							data-export-retry
						>
							Retry
						</Button>
					) : job.path ? (
						<Button
							size="sm"
							variant="outline"
							className="h-6 text-xs"
							onClick={() => job.path && window.worksuite?.files?.show(job.path)}
						>
							Show
						</Button>
					) : null}
					{job.status !== "running" && (
						<Button
							size="sm"
							variant="ghost"
							className="h-6 px-1.5 text-xs"
							aria-label={`Remove ${job.fileName}`}
							onClick={() => remove(job.id)}
						>
							×
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
