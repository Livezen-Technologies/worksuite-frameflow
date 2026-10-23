import { create } from "zustand";
import type { ExportOptions } from "@/export";

/** An export waiting, running or finished in the queue (SRS EX-14). */
export interface ExportJob {
	id: string;
	projectId: string;
	projectName: string;
	/** The sequence to export (ED-18); unset exports the open one. */
	sceneId?: string;
	/** File name with extension. */
	fileName: string;
	options: ExportOptions;
	status: "queued" | "running" | "done" | "failed" | "cancelled";
	progress: number;
	error?: string;
	path?: string;
	attempts: number;
}

interface ExportQueueState {
	jobs: ExportJob[];
	add: (job: Omit<ExportJob, "status" | "progress" | "attempts">) => void;
	update: (args: { id: string; patch: Partial<ExportJob> }) => void;
	remove: (id: string) => void;
	/** Puts a failed or cancelled job back in the queue. */
	retry: (id: string) => void;
	clearFinished: () => void;
}

export const useExportQueue = create<ExportQueueState>()((set) => ({
	jobs: [],
	add: (job) =>
		set((s) => ({
			jobs: [...s.jobs, { ...job, status: "queued", progress: 0, attempts: 0 }],
		})),
	update: ({ id, patch }) =>
		set((s) => ({
			jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
		})),
	remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
	retry: (id) =>
		set((s) => ({
			jobs: s.jobs.map((j) =>
				j.id === id && (j.status === "failed" || j.status === "cancelled")
					? { ...j, status: "queued", progress: 0, error: undefined }
					: j,
			),
		})),
	clearFinished: () =>
		set((s) => ({ jobs: s.jobs.filter((j) => j.status !== "done") })),
}));

/** The next job that can run now: queued and for the open project. */
export function nextRunnable({
	jobs,
	activeProjectId,
}: {
	jobs: ExportJob[];
	activeProjectId: string | null;
}): ExportJob | null {
	if (jobs.some((j) => j.status === "running")) return null;
	return (
		jobs.find(
			(j) => j.status === "queued" && j.projectId === activeProjectId,
		) ?? null
	);
}
