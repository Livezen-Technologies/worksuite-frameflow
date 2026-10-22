"use client";

import type {
	CloudSyncOperations,
	CloudSyncResult,
	WorksuiteCloudBridge,
} from "@/account/types";
import type {
	MediaAssetData,
	SerializedProject,
} from "@/services/storage/types";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";
import { type CloudLink, useCloudSync } from "./store";

/** What goes into a cloud project's `data` (SRS CL-02). */
export interface CloudProjectData {
	format: "frameflow-project";
	schemaVersion: 1;
	project: SerializedProject;
	media: (Omit<MediaAssetData, "thumbnailUrl"> & {
		assetId: string;
		sha256: string;
		contentType: string;
	})[];
}

export function isCloudProjectData(value: unknown): value is CloudProjectData {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<CloudProjectData>;
	return (
		candidate.format === "frameflow-project" &&
		typeof candidate.project?.metadata?.id === "string" &&
		Array.isArray(candidate.media)
	);
}

export class CloudSyncError extends Error {
	readonly code: string;

	constructor({ message, code }: { message: string; code: string }) {
		super(message);
		this.code = code;
	}
}

function bridge(): WorksuiteCloudBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.cloud ?? null;
}

export function isCloudAvailable(): boolean {
	return bridge() !== null;
}

export async function cloudCall<K extends keyof CloudSyncOperations>({
	operation,
	args,
}: {
	operation: K;
	args: CloudSyncOperations[K]["args"];
}): Promise<CloudSyncOperations[K]["value"]> {
	const cloud = bridge();
	if (!cloud)
		throw new CloudSyncError({
			message: "Cloud sync needs the desktop app.",
			code: "unavailable",
		});
	const result: CloudSyncResult<CloudSyncOperations[K]["value"]> =
		await cloud.sync(operation, args);
	if (!result.ok)
		throw new CloudSyncError({ message: result.message, code: result.code });
	return result.value;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

const store = () => useCloudSync.getState();

/** What counts as an edit: the timeline, settings and name, not save times. */
export async function projectContentHash(
	project: SerializedProject,
): Promise<string> {
	const content = JSON.stringify({
		name: project.metadata.name,
		scenes: project.scenes.map(({ updatedAt: _u, ...scene }) => scene),
		settings: project.settings,
		currentSceneId: project.currentSceneId,
	});
	return sha256(new TextEncoder().encode(content).buffer);
}

function setSyncing({
	projectId,
	progress,
	message,
}: {
	projectId: string;
	progress: number;
	message: string;
}) {
	store().setStatus({
		projectId,
		status: { state: "syncing", progress, message },
	});
}

/** This user's role on a cloud project; projects they made are "owner". */
export function cloudRole(cloudId: string) {
	return store().cloudProjects.find((p) => p.id === cloudId)?.role ?? "owner";
}

export async function refreshCloudProjects(): Promise<void> {
	if (!isCloudAvailable()) return;
	try {
		store().setCloudProjects(
			await cloudCall({ operation: "listProjects", args: {} }),
		);
	} catch {
		// Offline or signed out: keep the last list.
	}
}

/** Downloads a cloud project into local storage and returns its local id. */
async function importCloudProject({
	cloudId,
	asCopy,
	targetId,
	onProgress,
}: {
	cloudId: string;
	/** Keep it separate from the original (a conflict's other version). */
	asCopy: boolean;
	/** Overwrite this local project instead of creating one. */
	targetId?: string;
	onProgress?: (progress: number) => void;
}): Promise<string> {
	const remote = await cloudCall({
		operation: "getProject",
		args: { id: cloudId },
	});
	if (!isCloudProjectData(remote.data)) {
		throw new CloudSyncError({
			message:
				"This cloud project can't be opened by this version of FrameFlow.",
			code: "format",
		});
	}
	const data = remote.data;
	const originalId = data.project.metadata.id;
	const exists = !!(await storageService.getSerializedProject({
		id: originalId,
	}));
	const localId = targetId ?? (asCopy || exists ? generateUUID() : originalId);
	const previous = targetId ? store().links[targetId] : undefined;

	const media: CloudLink["media"] = {};
	for (const [index, item] of data.media.entries()) {
		onProgress?.(index / Math.max(1, data.media.length));
		// Media is immutable by hash: skip files this device already has.
		if (previous?.media[item.id]?.sha256 === item.sha256) {
			media[item.id] = previous.media[item.id];
			continue;
		}
		const bytes = await cloudCall({
			operation: "downloadAsset",
			args: { assetId: item.assetId },
		});
		const file = new File([bytes], item.name, {
			type: item.contentType,
			lastModified: item.lastModified,
		});
		const {
			assetId,
			sha256: hash,
			contentType: _type,
			size: _size,
			lastModified: _lm,
			...meta
		} = item;
		await storageService.saveMediaAsset({
			projectId: localId,
			mediaAsset: { ...meta, file },
		});
		media[item.id] = { assetId, sha256: hash };
	}

	const now = new Date().toISOString();
	const project: SerializedProject = {
		...data.project,
		metadata: {
			...data.project.metadata,
			id: localId,
			name: asCopy
				? `${data.project.metadata.name} (other version)`
				: data.project.metadata.name,
			updatedAt: asCopy ? now : data.project.metadata.updatedAt,
		},
	};
	await storageService.putSerializedProject({ project });

	if (!asCopy) {
		store().setLink({
			projectId: localId,
			link: {
				cloudId,
				revision: remote.revision,
				syncedAt: now,
				syncedLocalUpdatedAt: project.metadata.updatedAt,
				media,
				contentHash: await projectContentHash(project),
			},
		});
	}
	onProgress?.(1);
	return localId;
}

/** Opens a cloud-only project on this device (CL-03). */
export async function downloadCloudProject({
	cloudId,
	onProgress,
}: {
	cloudId: string;
	onProgress?: (progress: number) => void;
}): Promise<string> {
	return importCloudProject({ cloudId, asCopy: false, onProgress });
}

let running: Promise<void> | null = null;

/** Pushes one project and its new media. Safe to call repeatedly. */
export async function syncProject({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	while (running) await running.catch(() => {});
	const task = pushProject({ projectId });
	running = task;
	try {
		await task;
	} finally {
		running = null;
	}
}

async function pushProject({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	const serialized = await storageService.getSerializedProject({
		id: projectId,
	});
	if (!serialized) {
		store().setLink({ projectId, link: null });
		return;
	}
	const existing = store().links[projectId];
	const link: CloudLink = existing
		? { ...existing, media: { ...existing.media } }
		: {
				cloudId: "",
				revision: 0,
				syncedAt: null,
				syncedLocalUpdatedAt: null,
				media: {},
			};

	const contentHash = await projectContentHash(serialized);
	if (link.cloudId && cloudRole(link.cloudId) === "view") {
		store().setStatus({
			projectId,
			status: {
				state: "view-only",
				hasLocalChanges: link.contentHash !== contentHash,
			},
		});
		return;
	}
	if (link.cloudId && link.contentHash === contentHash) {
		// Only re-saved, not edited: nothing to push.
		store().setLink({
			projectId,
			link: { ...link, syncedLocalUpdatedAt: serialized.metadata.updatedAt },
		});
		return;
	}

	try {
		setSyncing({ projectId, progress: 0, message: "Preparing…" });
		const assets = (
			await storageService.loadAllMediaAssets({ projectId })
		).filter((asset) => !asset.ephemeral);
		const media: CloudProjectData["media"] = [];
		for (const [index, asset] of assets.entries()) {
			setSyncing({
				projectId,
				progress: index / Math.max(1, assets.length + 1),
				message: `Uploading media ${index + 1} of ${assets.length}`,
			});
			if (asset.url) URL.revokeObjectURL(asset.url);
			const buffer = await asset.file.arrayBuffer();
			const hash = await sha256(buffer);
			let known = link.media[asset.id];
			if (known?.sha256 !== hash) {
				const { assetId } = await cloudCall({
					operation: "uploadMedia",
					args: {
						name: asset.name,
						contentType: asset.file.type,
						sha256: hash,
						data: buffer,
					},
				});
				known = { sha256: hash, assetId };
				link.media[asset.id] = known;
				// Remember each finished file, so an interrupted sync skips it next time.
				store().setLink({
					projectId,
					link: { ...link, media: { ...link.media } },
				});
			}
			media.push({
				id: asset.id,
				name: asset.name,
				type: asset.type,
				size: asset.file.size,
				lastModified: asset.file.lastModified,
				width: asset.width,
				height: asset.height,
				duration: asset.duration,
				fps: asset.fps,
				hasAudio: asset.hasAudio,
				assetId: known.assetId,
				sha256: hash,
				contentType: asset.file.type,
			});
		}

		setSyncing({ projectId, progress: 0.95, message: "Saving project…" });
		if (!link.cloudId) {
			const created = await cloudCall({
				operation: "createProject",
				args: { name: serialized.metadata.name },
			});
			link.cloudId = created.id;
			link.revision = created.revision;
		}
		const data: CloudProjectData = {
			format: "frameflow-project",
			schemaVersion: 1,
			project: serialized,
			media,
		};
		let otherProjectId: string | null = null;
		let saved: { revision: number };
		try {
			saved = await cloudCall({
				operation: "putProject",
				args: {
					id: link.cloudId,
					revision: link.revision,
					name: serialized.metadata.name,
					data,
				},
			});
		} catch (error) {
			if (!(error instanceof CloudSyncError) || error.code !== "conflict")
				throw error;
			// CL-04: keep both. The cloud's version becomes a local copy, then
			// this device's version is saved on top of it.
			otherProjectId = await importCloudProject({
				cloudId: link.cloudId,
				asCopy: true,
			});
			const remote = await cloudCall({
				operation: "getProject",
				args: { id: link.cloudId },
			});
			saved = await cloudCall({
				operation: "putProject",
				args: {
					id: link.cloudId,
					revision: remote.revision,
					name: serialized.metadata.name,
					data,
				},
			});
		}

		const now = new Date().toISOString();
		store().setLink({
			projectId,
			link: {
				...link,
				revision: saved.revision,
				syncedAt: now,
				syncedLocalUpdatedAt: serialized.metadata.updatedAt,
				contentHash,
			},
		});
		store().setStatus({
			projectId,
			status: otherProjectId
				? { state: "conflict", otherProjectId }
				: { state: "idle" },
		});
	} catch (error) {
		if (error instanceof CloudSyncError && error.code === "forbidden") {
			store().setStatus({
				projectId,
				status: { state: "view-only", hasLocalChanges: true },
			});
			return;
		}
		store().setStatus({
			projectId,
			status: {
				state: "error",
				message: error instanceof Error ? error.message : "Sync failed",
			},
		});
		throw error;
	}
}

/**
 * Brings a newer cloud revision down when this device has no unsynced edits;
 * with edits, the next push handles it as a conflict (keep both).
 */
export async function pullProject({
	projectId,
	discardLocalChanges = false,
}: {
	projectId: string;
	/** Replace this device's unsynced edits (a viewer getting the latest). */
	discardLocalChanges?: boolean;
}): Promise<boolean> {
	const link = store().links[projectId];
	const serialized = await storageService.getSerializedProject({
		id: projectId,
	});
	if (!link?.cloudId || !serialized) return false;
	if (
		!discardLocalChanges &&
		link.contentHash !== (await projectContentHash(serialized))
	) {
		if (cloudRole(link.cloudId) === "view") {
			store().setStatus({
				projectId,
				status: { state: "view-only", hasLocalChanges: true },
			});
		}
		return false;
	}
	setSyncing({ projectId, progress: 0, message: "Downloading changes…" });
	try {
		await importCloudProject({
			cloudId: link.cloudId,
			asCopy: false,
			targetId: projectId,
			onProgress: (progress) =>
				setSyncing({ projectId, progress, message: "Downloading changes…" }),
		});
		store().setStatus({
			projectId,
			status:
				cloudRole(link.cloudId) === "view"
					? { state: "view-only", hasLocalChanges: false }
					: { state: "idle" },
		});
		return true;
	} catch (error) {
		store().setStatus({
			projectId,
			status: {
				state: "error",
				message: error instanceof Error ? error.message : "Download failed",
			},
		});
		return false;
	}
}

/** Turns sync on for a project and pushes it now. */
export async function enableSync({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	if (!store().links[projectId]) {
		store().setLink({
			projectId,
			link: {
				cloudId: "",
				revision: 0,
				syncedAt: null,
				syncedLocalUpdatedAt: null,
				media: {},
			},
		});
	}
	await syncProject({ projectId });
}

/** Stops syncing. The cloud copy stays; nothing local is deleted. */
export function disableSync({ projectId }: { projectId: string }): void {
	store().setLink({ projectId, link: null });
	store().setStatus({ projectId, status: { state: "idle" } });
}

/**
 * Pulls newer cloud revisions and pushes local edits for every synced
 * project. The project open in the editor is never pulled under it.
 */
export async function syncPendingProjects({
	openProjectId,
}: {
	openProjectId?: string | null;
} = {}): Promise<void> {
	if (!isCloudAvailable()) return;
	const { links } = store();
	const ids = Object.keys(links);
	if (ids.length === 0) return;
	await refreshCloudProjects();
	const metadata = await storageService.loadAllProjectsMetadata();
	const remote = new Map(store().cloudProjects.map((p) => [p.id, p.revision]));
	for (const id of ids) {
		const known = links[id];
		const remoteRevision = remote.get(known.cloudId);
		if (
			id !== openProjectId &&
			remoteRevision !== undefined &&
			remoteRevision > known.revision
		) {
			await pullProject({ projectId: id });
		}
	}
	for (const id of ids) {
		const meta = metadata.find((m) => m.id === id);
		const link = store().links[id];
		if (!link) continue;
		if (!meta) {
			store().setLink({ projectId: id, link: null });
			continue;
		}
		const changed =
			!link.syncedLocalUpdatedAt ||
			meta.updatedAt.getTime() > new Date(link.syncedLocalUpdatedAt).getTime();
		if (changed && store().status[id]?.state !== "syncing") {
			await syncProject({ projectId: id }).catch(() => {});
		}
	}
}
