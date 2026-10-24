"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LinkInfo } from "@/account/types";

export type DownloadStatus = "queued" | "downloading" | "paused" | "processing" | "done" | "error";

/** One queued or finished download (DL-06, DL-08). */
export interface DownloadItem {
	id: string;
	link: string;
	info: LinkInfo;
	title: string;
	host: string;
	/** HLS variant URL, or the file URL. */
	mediaUrl: string;
	quality: string;
	audioOnly: boolean;
	/** "keep", or a converter format id (CV-02). */
	convert: string;
	start?: number;
	end?: number;
	openWhenDone: boolean;
	status: DownloadStatus;
	received: number;
	total: number;
	speed: number;
	path?: string;
	bytes?: number;
	error?: string;
	addedAt: number;
	finishedAt?: number;
}

interface State {
	items: DownloadItem[];
	/** Sources the user confirmed they own or have permission for (DL-05). */
	rightsHosts: string[];
	parallel: number;
	/** Bytes per second, 0 = no limit. */
	speedLimit: number;
	add: (items: DownloadItem[]) => void;
	patch: (args: { id: string; patch: Partial<DownloadItem> }) => void;
	remove: (id: string) => void;
	grantRights: (host: string) => void;
	setParallel: (n: number) => void;
	setSpeedLimit: (n: number) => void;
}

export const useDownloads = create<State>()(
	persist(
		(set) => ({
			items: [],
			rightsHosts: [],
			parallel: 2,
			speedLimit: 0,
			add: (items) => set((s) => ({ items: [...s.items, ...items] })),
			patch: ({ id, patch }) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
			remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
			grantRights: (host) => set((s) => ({ rightsHosts: s.rightsHosts.includes(host) ? s.rightsHosts : [...s.rightsHosts, host] })),
			setParallel: (parallel) => set({ parallel: Math.max(1, Math.min(4, parallel)) }),
			setSpeedLimit: (speedLimit) => set({ speedLimit }),
		}),
		{
			name: "frameflow-downloads",
			// Anything in flight when the app closed resumes as paused (DL-06).
			merge: (persisted, current) => {
				const p = (persisted ?? {}) as Partial<State>;
				return {
					...current,
					...p,
					items: (p.items ?? []).map((i) => (i.status === "downloading" || i.status === "processing" ? { ...i, status: "paused", speed: 0 } : i)),
				};
			},
		},
	),
);

const active = new Set<string>();
let progressHooked = false;

/** Starts queued items up to the parallel limit. Safe to call any time. */
export function pumpQueue({ onFinished }: { onFinished?: (item: DownloadItem) => void } = {}) {
	const tools = window.worksuite?.tools;
	if (!tools) return;
	if (!progressHooked) {
		progressHooked = true;
		const last = new Map<string, { at: number; received: number }>();
		tools.onDownloadProgress(({ jobId, received, total }) => {
			const prev = last.get(jobId);
			const now = performance.now();
			let speed = useDownloads.getState().items.find((i) => i.id === jobId)?.speed ?? 0;
			if (prev && now - prev.at > 500) {
				speed = ((received - prev.received) / (now - prev.at)) * 1000;
				last.set(jobId, { at: now, received });
			} else if (!prev) last.set(jobId, { at: now, received });
			useDownloads.getState().patch({ id: jobId, patch: { received, total, speed: Math.max(0, speed) } });
		});
	}
	const { items, parallel } = useDownloads.getState();
	const free = parallel - active.size;
	for (const item of items.filter((i) => i.status === "queued").slice(0, Math.max(0, free))) {
		active.add(item.id);
		void run(item).finally(() => {
			active.delete(item.id);
			const done = useDownloads.getState().items.find((i) => i.id === item.id);
			if (done?.status === "done") onFinished?.(done);
			pumpQueue({ onFinished });
		});
	}
}

const clean = (error: unknown) =>
	(error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

async function run(item: DownloadItem) {
	const tools = window.worksuite?.tools;
	if (!tools) return;
	const { patch, speedLimit } = useDownloads.getState();
	patch({ id: item.id, patch: { status: "downloading", error: undefined } });
	const stream = item.info.kind === "hls" || item.info.kind === "dash";
	try {
		let saved = await tools.download({
			jobId: item.id,
			url: item.mediaUrl,
			kind: item.info.kind,
			name: item.info.name,
			title: item.title,
			duration: item.info.duration,
			speedLimit,
			...(stream ? { start: item.start, end: item.end, audioOnly: item.audioOnly } : {}),
		});
		// Files: cut a part, keep only the sound or convert afterwards (DL-04).
		const needsPart = !stream && (item.start !== undefined || item.end !== undefined);
		const format = item.audioOnly && !stream ? "m4a" : item.convert !== "keep" ? item.convert : null;
		if (format || needsPart) {
			patch({ id: item.id, patch: { status: "processing", received: 0, total: 1 } });
			const result =
				format || !needsPart
					? await tools.convert({ jobId: item.id, input: saved.path, options: { format: format ?? "mp4-h264", start: item.start, end: item.end } })
					: await tools.trim({ jobId: item.id, input: saved.path, start: item.start ?? 0, end: item.end ?? item.info.duration ?? 1e9 });
			saved = { path: result.path, name: result.path.split(/[\\/]/).pop() ?? saved.name, bytes: result.bytes };
		}
		patch({ id: item.id, patch: { status: "done", path: saved.path, bytes: saved.bytes, speed: 0, finishedAt: Date.now() } });
	} catch (error) {
		const message = clean(error);
		const paused = /Paused/.test(message) || useDownloads.getState().items.find((i) => i.id === item.id)?.status === "paused";
		patch({ id: item.id, patch: { status: paused ? "paused" : "error", error: paused ? undefined : message, speed: 0 } });
	}
}

export function pauseItem(id: string) {
	void window.worksuite?.tools?.pauseDownload(id);
	useDownloads.getState().patch({ id: id, patch: { status: "paused", speed: 0 } });
}

export function resumeItem(id: string) {
	useDownloads.getState().patch({ id: id, patch: { status: "queued" } });
}

export function cancelItem(id: string) {
	void window.worksuite?.tools?.cancelDownload(id);
	useDownloads.getState().remove(id);
}
