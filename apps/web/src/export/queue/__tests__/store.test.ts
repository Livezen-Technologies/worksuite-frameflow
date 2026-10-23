import { beforeEach, describe, expect, test } from "bun:test";
import type { ExportOptions } from "@/export";
import { nextRunnable, useExportQueue } from "../store";

const options: ExportOptions = { format: "mp4", quality: "high" };

const add = ({ id, projectId = "p1" }: { id: string; projectId?: string }) =>
	useExportQueue.getState().add({
		id,
		projectId,
		projectName: "P",
		fileName: `${id}.mp4`,
		options,
	});

describe("export queue", () => {
	beforeEach(() => useExportQueue.setState({ jobs: [] }));

	test("runs one at a time, for the open project", () => {
		add({ id: "a", projectId: "p2" });
		add({ id: "b" });
		const jobs = useExportQueue.getState().jobs;
		expect(nextRunnable({ jobs, activeProjectId: "p1" })?.id).toBe("b");
		useExportQueue.getState().update({ id: "b", patch: { status: "running" } });
		expect(
			nextRunnable({ jobs: useExportQueue.getState().jobs, activeProjectId: "p2" }),
		).toBeNull();
	});

	test("retry re-queues failed jobs only", () => {
		add({ id: "a" });
		add({ id: "b" });
		const q = useExportQueue.getState();
		q.update({ id: "a", patch: { status: "failed", error: "x", progress: 0.4 } });
		q.update({ id: "b", patch: { status: "done" } });
		q.retry("a");
		q.retry("b");
		const [a, b] = useExportQueue.getState().jobs;
		expect(a).toMatchObject({ status: "queued", progress: 0, error: undefined });
		expect(b?.status).toBe("done");
	});
});
