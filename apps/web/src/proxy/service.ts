import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { OPFSAdapter } from "@/services/storage/opfs-adapter";
import { helperBridge } from "./bridge";
import { proxyRegistry } from "./registry";
import { needsProxy, proxyHeightFor } from "./rules";
import { isSphereMedia } from "@/vr/store";
import { useProxySettings, useProxyStatus } from "./store";

const CHUNK = 8 * 1024 * 1024;

const storage = (projectId: string) => new OPFSAdapter(`proxies-${projectId}`);
const status = () => useProxyStatus.getState();
const inFlight = new Map<string, Promise<void>>();

/** Stream the original to the helper, let FFmpeg make the proxy, read it back. */
async function makeProxy({
	projectId,
	asset,
}: {
	projectId: string;
	asset: MediaAsset;
}) {
	const bridge = helperBridge();
	if (!bridge) return;
	const { gpu } = useProxySettings.getState();
	const height = proxyHeightFor({
		asset,
		height: useProxySettings.getState().height,
		sphere: isSphereMedia(asset.id),
	});
	status().setStatus({ mediaId: asset.id, status: { state: "queued" } });
	const { jobId } = await bridge.begin();
	const off = bridge.onProgress((p) => {
		if (p.jobId === jobId)
			status().setStatus({
				mediaId: asset.id,
				status: { state: "making", progress: p.progress },
			});
	});
	try {
		for (let offset = 0; offset < asset.file.size; offset += CHUNK) {
			const chunk = await asset.file
				.slice(offset, offset + CHUNK)
				.arrayBuffer();
			await bridge.write({ jobId, chunk });
		}
		status().setStatus({
			mediaId: asset.id,
			status: { state: "making", progress: 0 },
		});
		const { size } = await bridge.proxy({
			jobId,
			height,
			gpu,
			duration: asset.duration,
		});
		const parts: ArrayBuffer[] = [];
		for (let offset = 0; offset < size; offset += CHUNK)
			parts.push(await bridge.read({ jobId, offset, length: CHUNK }));
		const file = new File(parts, `${asset.id}.mp4`, { type: "video/mp4" });
		await storage(projectId).set({ key: asset.id, value: file });
		proxyRegistry.set({ mediaId: asset.id, file });
		status().setStatus({ mediaId: asset.id, status: { state: "ready", size } });
	} finally {
		off();
		await bridge.release({ jobId });
	}
}

export function ensureProxy({
	projectId,
	asset,
}: {
	projectId: string;
	asset: MediaAsset;
}): Promise<void> {
	const key = `${projectId}:${asset.id}`;
	const running = inFlight.get(key);
	if (running) return running;
	const task = makeProxy({ projectId, asset })
		.catch((error: unknown) => {
			status().setStatus({
				mediaId: asset.id,
				status: {
					state: "failed",
					error: error instanceof Error ? error.message : String(error),
				},
			});
		})
		.finally(() => inFlight.delete(key));
	inFlight.set(key, task);
	return task;
}

export async function removeProxy({
	projectId,
	mediaId,
}: {
	projectId: string;
	mediaId: string;
}) {
	proxyRegistry.remove(mediaId);
	status().setStatus({ mediaId, status: null });
	await storage(projectId)
		.remove(mediaId)
		.catch(() => {});
}

/** Load existing proxies for a project, drop orphans, and queue missing ones. */
export async function syncProjectProxies({
	editor,
	projectId,
}: {
	editor: EditorCore;
	projectId: string;
}) {
	const assets = editor.media.getAssets();
	const store = storage(projectId);
	const stored = new Set(await store.list().catch(() => [] as string[]));
	const { mode, height } = useProxySettings.getState();
	for (const id of stored) {
		if (!assets.some((a) => a.id === id))
			await store.remove(id).catch(() => {});
	}
	for (const asset of assets) {
		if (proxyRegistry.has(asset.id)) continue;
		if (stored.has(asset.id)) {
			const file = await store.get(asset.id);
			if (file) {
				proxyRegistry.set({ mediaId: asset.id, file });
				status().setStatus({
					mediaId: asset.id,
					status: { state: "ready", size: file.size },
				});
				continue;
			}
		}
		const target = proxyHeightFor({ asset, height, sphere: isSphereMedia(asset.id) });
		if (helperBridge() && needsProxy({ asset, mode, height: target }))
			void ensureProxy({ projectId, asset });
	}
}

export async function rebuildAllProxies({
	editor,
	projectId,
}: {
	editor: EditorCore;
	projectId: string;
}) {
	for (const asset of editor.media.getAssets())
		await removeProxy({ projectId, mediaId: asset.id });
	await syncProjectProxies({ editor, projectId });
}
