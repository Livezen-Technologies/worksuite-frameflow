"use client";

import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Output,
	WebMOutputFormat,
} from "mediabunny";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import type { RecordingMode } from "./preflight";
import { buildWav } from "./wav";

/**
 * Crash-safe recording storage (SRS AR-11, AR-12, SC-09, SC-43). Each track
 * is written as numbered chunks every second or two; a session's manifest
 * says how to rebuild its files, so an interrupted take can be recovered.
 */
export type TrackRole = "screen" | "camera" | "mic";

export interface TrackManifest {
	role: TrackRole;
	label: string;
	format: "wav" | "webm";
	sampleRate?: number;
	channelCount?: number;
	/** Leading frames to drop, for input latency (AR-22). */
	skipFrames?: number;
}

export interface SessionManifest {
	id: string;
	projectId: string;
	mode: RecordingMode;
	startedAt: number;
	/** Timeline time (seconds) the take starts at. */
	timelineStart: number;
	tracks: TrackManifest[];
	/** Marker times in recorded seconds (SC-36). */
	markers: number[];
	duration: number;
	/** Punch-in range in timeline seconds (AR-05): the take replaces it. */
	punch?: { start: number; end: number };
}

interface RecordingSessionsStore {
	sessions: SessionManifest[];
	save: (session: SessionManifest) => void;
	forget: (id: string) => void;
}

export const useRecordingSessions = create<RecordingSessionsStore>()(
	persist(
		(set) => ({
			sessions: [],
			save: (session) =>
				set((s) => ({
					sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
				})),
			forget: (id) =>
				set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
		}),
		{ name: "frameflow-recording-sessions" },
	),
);

interface ChunkRecord {
	data: Blob;
}

const chunks = new IndexedDBAdapter<ChunkRecord>({
	dbName: "frameflow-recordings",
	storeName: "chunks",
	version: 1,
});

const chunkKey = ({
	sessionId,
	role,
	index,
}: {
	sessionId: string;
	role: TrackRole;
	index: number;
}) => `${sessionId}:${role}:${String(index).padStart(7, "0")}`;

export function writeChunk({
	sessionId,
	role,
	index,
	data,
}: {
	sessionId: string;
	role: TrackRole;
	index: number;
	data: Blob;
}): Promise<void> {
	return chunks.set({
		key: chunkKey({ sessionId, role, index }),
		value: { data },
	});
}

async function readChunks({
	sessionId,
	role,
}: {
	sessionId: string;
	role: TrackRole;
}): Promise<Blob[]> {
	const prefix = `${sessionId}:${role}:`;
	const keys = (await chunks.list()).filter((k) => k.startsWith(prefix)).sort();
	const records = await Promise.all(keys.map((k) => chunks.get(k)));
	return records.flatMap((r) => (r ? [r.data] : []));
}

export async function deleteSessionData(sessionId: string): Promise<void> {
	const keys = (await chunks.list()).filter((k) =>
		k.startsWith(`${sessionId}:`),
	);
	await Promise.all(keys.map((k) => chunks.remove(k)));
	useRecordingSessions.getState().forget(sessionId);
}

/** Rewrites a MediaRecorder WebM so it has a duration and seek index. */
async function finalizeWebm(blob: Blob): Promise<Blob> {
	try {
		const input = new Input({
			source: new BlobSource(blob),
			formats: ALL_FORMATS,
		});
		const target = new BufferTarget();
		const output = new Output({ format: new WebMOutputFormat(), target });
		const conversion = await Conversion.init({ input, output });
		await conversion.execute();
		return target.buffer
			? new Blob([target.buffer], { type: blob.type })
			: blob;
	} catch (error) {
		console.warn("Couldn't index the recording, keeping it as is:", error);
		return blob;
	}
}

export interface RecordedFile {
	role: TrackRole;
	label: string;
	file: File;
}

/** Builds the session's files from its chunks (after Stop or a crash). */
export async function assembleSession(
	session: SessionManifest,
): Promise<RecordedFile[]> {
	const stamp = new Date(session.startedAt)
		.toISOString()
		.slice(0, 19)
		.replace("T", " ")
		.replace(/:/g, ".");
	const files: RecordedFile[] = [];
	for (const track of session.tracks) {
		const parts = await readChunks({
			sessionId: session.id,
			role: track.role,
		});
		if (parts.length === 0) continue;
		const name = `${track.label} ${stamp}`;
		if (track.format === "wav") {
			const pcm = await Promise.all(
				parts.map(async (p) => new Uint8Array(await p.arrayBuffer())),
			);
			const wav = buildWav({
				chunks: pcm,
				sampleRate: track.sampleRate ?? 48_000,
				channelCount: track.channelCount ?? 1,
				skipFrames: track.skipFrames,
			});
			files.push({
				role: track.role,
				label: track.label,
				file: new File([wav], `${name}.wav`, { type: "audio/wav" }),
			});
		} else {
			const type = parts[0]?.type || "video/webm";
			const webm = await finalizeWebm(new Blob(parts, { type }));
			files.push({
				role: track.role,
				label: track.label,
				file: new File([webm], `${name}.webm`, { type: "video/webm" }),
			});
		}
	}
	return files;
}
