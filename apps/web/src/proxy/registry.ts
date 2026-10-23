/**
 * Ready proxies for the open project, read by the preview renderer. Kept
 * free of React and storage so the render path stays cheap.
 */
const ready = new Map<string, File>();
let enabled = true;
const listeners = new Set<() => void>();

export const proxyRegistry = {
	set({ mediaId, file }: { mediaId: string; file: File }) {
		ready.set(mediaId, file);
		for (const l of listeners) l();
	},
	remove(mediaId: string) {
		ready.delete(mediaId);
		for (const l of listeners) l();
	},
	clear() {
		ready.clear();
		for (const l of listeners) l();
	},
	has: (mediaId: string) => ready.has(mediaId),
	setEnabled(next: boolean) {
		enabled = next;
		for (const l of listeners) l();
	},
	isEnabled: () => enabled,
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};

/** A clip's proxy if one is ready (angle viewer, SC-30). */
export function proxyFileFor(mediaId: string): File | null {
	return ready.get(mediaId) ?? null;
}

/** The file the preview should decode: the proxy when there is one and proxies are on. */
export function previewSource({
	mediaId,
	file,
	useProxies,
}: {
	mediaId: string;
	file: File;
	useProxies: boolean;
}): { mediaId: string; file: File } {
	const proxy = useProxies && enabled ? ready.get(mediaId) : undefined;
	return proxy
		? { mediaId: `${mediaId}:proxy`, file: proxy }
		: { mediaId, file };
}
