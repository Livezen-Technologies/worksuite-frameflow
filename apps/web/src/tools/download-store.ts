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
	/** Add to the open project's Media or timeline when done (older items: none). */
	afterDownload?: "library" | "timeline" | "none";
	/** Save the link's subtitles next to the video as .srt (DL-04). */
	saveSubs: boolean;
	/** Transcribe with local Whisper after opening it in the editor (DL-07). */
	transcribe: string | null;
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
	/** Hold the queue on mobile data (DL-06). */
	unmeteredOnly: boolean;
	/** True while the queue waits for Wi-Fi or Ethernet. */
	held: boolean;
	add: (items: DownloadItem[]) => void;
	patch: (args: { id: string; patch: Partial<DownloadItem> }) => void;
	remove: (id: string) => void;
	grantRights: (host: string) => void;
	setParallel: (n: number) => void;
	setSpeedLimit: (n: number) => void;
	setUnmeteredOnly: (on: boolean) => void;
}

export const useDownloads = create<State>()(
	persist(
		(set) => ({
			items: [],
			rightsHosts: [],
			parallel: 2,
			speedLimit: 0,
			unmeteredOnly: false,
			held: false,
			add: (items) => set((s) => ({ items: [...s.items, ...items] })),
			patch: ({ id, patch }) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
			remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
			grantRights: (host) => set((s) => ({ rightsHosts: s.rightsHosts.includes(host) ? s.rightsHosts : [...s.rightsHosts, host] })),
			setParallel: (parallel) => set({ parallel: Math.max(1, Math.min(4, parallel)) }),
			setSpeedLimit: (speedLimit) => set({ speedLimit }),
			setUnmeteredOnly: (unmeteredOnly) => set({ unmeteredOnly }),
		}),
		{
			name: "frameflow-downloads",
			// Anything in flight when the app closed resumes as paused (DL-06).
			merge: (persisted, current) => {
				const p = (persisted ?? {}) as Partial<State>;
				return {
					...current,
					...p,
					held: false,
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
	const { items, unmeteredOnly } = useDownloads.getState();
	if (!items.some((i) => i.status === "queued")) return;
	// Wi-Fi or Ethernet only: wait while the only connection is mobile data.
	if (unmeteredOnly) {
		void tools.connection().then((kind) => {
			const held = kind === "cellular";
			useDownloads.setState({ held });
			if (held) setTimeout(() => pumpQueue({ onFinished }), 20_000);
			else startQueued({ onFinished });
		});
		return;
	}
	useDownloads.setState({ held: false });
	startQueued({ onFinished });
}

function startQueued({ onFinished }: { onFinished?: (item: DownloadItem) => void }) {
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
		if (item.saveSubs && item.info.subtitles?.length) {
			await tools.saveSubtitles({ videoPath: saved.path, subtitles: item.info.subtitles }).catch(() => []);
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
