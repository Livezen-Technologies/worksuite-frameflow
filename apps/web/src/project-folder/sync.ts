import { OPFSAdapter } from "@/services/storage/opfs-adapter";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";
import { foldersBridge } from "./bridge";
import {
	buildManifest,
	buildMediaIndex,
	entryFileName,
	orphanedMediaFiles,
	FolderFormatError,
	parseManifest,
	parseMediaIndex,
	type FolderMediaEntry,
} from "./format";
import { useProjectFolders } from "./store";

const store = () => useProjectFolders.getState();

/** Look up (and cache) whether a project is saved as a folder. */
export async function refreshFolderLink({
	projectId,
}: {
	projectId: string;
}): Promise<string | null> {
	const bridge = foldersBridge();
	if (!bridge) return null;
	const path = await bridge.get({ projectId });
	store().setLink({ projectId, path });
	return path;
}

/**
 * Write the project into its folder: media files first (only ones not
 * already there at the same size), then media.json, then project.json,
 * so the manifest never points at a file that isn't written yet.
 */
/** Editing proxies go to the folder's proxies/, named by media id (PR-03). */
async function writeProxies({ projectId, mediaIds }: { projectId: string; mediaIds: Set<string> }) {
	const bridge = foldersBridge();
	if (!bridge) return;
	const proxies = new OPFSAdapter(`proxies-${projectId}`);
	const stored = await proxies.list().catch(() => [] as string[]);
	const existing = new Map((await bridge.listMedia({ projectId, folder: "proxies" })).map((f) => [f.name, f.size]));
	for (const id of stored) {
		if (!mediaIds.has(id)) continue;
		const file = await proxies.get(id);
		if (!file || existing.get(`${id}.mp4`) === file.size) continue;
		await bridge.writeMedia({ projectId, fileName: `${id}.mp4`, data: await file.arrayBuffer(), folder: "proxies" });
	}
	// Proxies of deleted media leave the folder too.
	for (const name of existing.keys())
		if (!mediaIds.has(name.replace(/\.mp4$/, ""))) await bridge.removeMedia({ projectId, fileName: name, folder: "proxies" });
}

export async function writeProjectFolder({
	projectId,
}: {
	projectId: string;
}): Promise<void> {
	const bridge = foldersBridge();
	if (!bridge) throw new Error("Project folders need the desktop app.");
	const project = await storageService.getSerializedProject({ id: projectId });
	if (!project) throw new Error("Project not found.");
	store().setStatus({ projectId, status: "saving" });
	try {
		const files = new Map<string, File>();
		const metadata = await storageService.listMediaMetadata({ projectId });
		for (const item of metadata) {
			// OPFS hands back a File without reading it, so this is cheap.
			const file = await storageService.loadMediaFile({
				projectId,
				id: item.id,
			});
			if (file) files.set(item.id, file);
		}
		const media = buildMediaIndex({
			media: metadata
				.filter((item) => files.has(item.id))
				.map((item) => ({ ...item, mimeType: files.get(item.id)?.type })),
		});
		const existing = new Map(
			(await bridge.listMedia({ projectId })).map((f) => [f.name, f.size]),
		);
		for (const entry of media) {
			const fileName = entryFileName(entry);
			if (existing.get(fileName) === entry.size) continue;
			const file = files.get(entry.id);
			if (!file) continue;
			await bridge.writeMedia({
				projectId,
				fileName,
				data: await file.arrayBuffer(),
			});
		}
		// Media deleted from the project leaves the folder too.
		for (const fileName of orphanedMediaFiles({ existing: [...existing.keys()], media }))
			await bridge.removeMedia({ projectId, fileName });
		await writeProxies({ projectId, mediaIds: new Set(media.map((m) => m.id)) });
		await bridge.writeJson({
			projectId,
			name: "media.json",
			text: JSON.stringify(media, null, 2),
		});
		await bridge.writeJson({
			projectId,
			name: "project.json",
			text: buildManifest({ project }),
		});
		store().setStatus({ projectId, status: "saved" });
	} catch (error) {
		store().setStatus({
			projectId,
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/** Ask where to save, then write the project there and keep it in sync. */
export async function saveAsProjectFolder({
	projectId,
}: {
	projectId: string;
}): Promise<string | null> {
	const bridge = foldersBridge();
	if (!bridge) throw new Error("Project folders need the desktop app.");
	const project = await storageService.getSerializedProject({ id: projectId });
	if (!project) throw new Error("Project not found.");
	const result = await bridge.create({
		projectId,
		name: project.metadata.name,
	});
	if (!result.saved || !result.path) return null;
	store().setLink({ projectId, path: result.path });
	await writeProjectFolder({ projectId });
	return result.path;
}

export async function stopSavingToFolder({ projectId }: { projectId: string }) {
	await foldersBridge()?.unlink({ projectId });
	store().setLink({ projectId, path: null });
}

export async function moveProjectFolder({ projectId }: { projectId: string }) {
	const bridge = foldersBridge();
	if (!bridge) return null;
	const result = await bridge.move({ projectId });
	if (result.error) throw new Error(result.error);
	if (result.moved && result.path)
		store().setLink({ projectId, path: result.path });
	return result.moved ? (result.path ?? null) : null;
}

// Autosave: mirror every save of a linked project, at most every 1.5 s.
const AUTOSAVE_DELAY = 1500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;

export function startFolderAutosave(): () => void {
	if (started || !foldersBridge()) return () => {};
	started = true;
	const off = storageService.onProjectChanged((projectId) => {
		if (!store().links[projectId]) return;
		clearTimeout(timers.get(projectId));
		timers.set(
			projectId,
			setTimeout(() => {
				timers.delete(projectId);
				void writeProjectFolder({ projectId }).catch(() => {
					// Status shows the error; the next save retries.
				});
			}, AUTOSAVE_DELAY),
		);
	});
	return () => {
		off();
		started = false;
	};
}

function fileFromEntry({
	entry,
	data,
}: {
	entry: FolderMediaEntry;
	data: BlobPart;
}) {
	return new File([data], entry.name, {
		type: entry.mimeType ?? "",
		lastModified: entry.lastModified,
	});
}

async function saveEntry({
	projectId,
	entry,
	file,
}: {
	projectId: string;
	entry: FolderMediaEntry;
	file: File;
}) {
	const {
		file: _path,
		size: _size,
		lastModified: _lm,
		mimeType: _mime,
		...meta
	} = entry;
	await storageService.saveMediaAsset({
		projectId,
		mediaAsset: { ...meta, file },
	});
}

/**
 * Open a project folder: load the project and every media file into the
 * app, link the folder so later edits save back to it, and report media
 * that wasn't in the folder so the user can relink it.
 */
export async function openProjectFolder(): Promise<{
	projectId: string;
	missing: FolderMediaEntry[];
} | null> {
	const bridge = foldersBridge();
	if (!bridge) throw new Error("Project folders need the desktop app.");
	const result = await bridge.open();
	if (!result.opened) {
		if (result.error) throw new FolderFormatError(result.error);
		return null;
	}
	const project = parseManifest(result.project);
	const media = parseMediaIndex(result.media);
	const originalId = project.metadata.id;

	// Already here and linked to this folder: just open it.
	const linkedPath = await bridge.get({ projectId: originalId });
	const exists = !!(await storageService.getSerializedProject({
		id: originalId,
	}));
	if (exists && linkedPath === result.path)
		return { projectId: originalId, missing: [] };
	// The same project from somewhere else becomes its own copy.
	const projectId = exists ? generateUUID() : originalId;

	const missing: FolderMediaEntry[] = [];
	for (const entry of media) {
		try {
			const data = await bridge.readMedia({
				root: result.path,
				fileName: entryFileName(entry),
			});
			await saveEntry({
				projectId,
				entry,
				file: fileFromEntry({ entry, data }),
			});
		} catch {
			missing.push(entry);
		}
	}
	// Proxies saved in the folder come back too, so they needn't be made again.
	const proxies = new OPFSAdapter(`proxies-${projectId}`);
	for (const entry of media) {
		try {
			const data = await bridge.readMedia({ root: result.path, fileName: `${entry.id}.mp4`, folder: "proxies" });
			await proxies.set({ key: entry.id, value: new File([data], `${entry.id}.mp4`, { type: "video/mp4" }) });
		} catch {
			// No proxy for this one: it is made again if needed.
		}
	}
	await storageService.putSerializedProject({
		project: { ...project, metadata: { ...project.metadata, id: projectId } },
	});
	await bridge.attach({ projectId, root: result.path });
	store().setLink({ projectId, path: result.path });
	if (missing.length) store().setRelink({ projectId, missing });
	return { projectId, missing };
}

/** Store the files the user picked for missing media; they're copied into the folder on the next save. */
export async function relinkMedia({
	projectId,
	pairs,
}: {
	projectId: string;
	pairs: { entry: FolderMediaEntry; file: File }[];
}) {
	for (const { entry, file } of pairs) {
		await saveEntry({
			projectId,
			entry: {
				...entry,
				size: file.size,
				lastModified: file.lastModified,
				mimeType: file.type,
			},
			file,
		});
	}
}
