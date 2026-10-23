import type { EditorCore } from "@/core";
import {
	buildPasteClipboardCommand,
	copyClipboardEntry,
	type ClipboardEntry,
	type CopyContext,
	type PasteContext,
} from "@/clipboard";
import type { MediaAsset } from "@/media/types";
import type { MediaTime } from "@/wasm";

export class ClipboardManager {
	private entry: ClipboardEntry | null = null;
	/** Project the entry was copied from, and the media its clips use, so
	 * pasting into another project tab brings the media along (MP-15). */
	private sourceProjectId: string | null = null;
	private media: MediaAsset[] = [];
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	getEntry(): ClipboardEntry | null {
		return this.entry;
	}

	hasEntry(): boolean {
		return this.entry !== null;
	}

	copy(): boolean {
		const entry = copyClipboardEntry({
			context: this.getCopyContext(),
		});
		if (!entry) {
			return false;
		}

		this.entry = entry;
		this.sourceProjectId = this.editor.project.getActiveOrNull()?.metadata.id ?? null;
		const ids = new Set(
			entry.type === "elements"
				? entry.items.flatMap((item) =>
						"mediaId" in item.element && typeof item.element.mediaId === "string"
							? [item.element.mediaId]
							: [],
					)
				: [],
		);
		this.media = this.editor.media.getAssets().filter((asset) => ids.has(asset.id));
		this.notify();
		return true;
	}

	/** Adds the copied media to the open project; old id → new id. */
	private async bringMedia(): Promise<Map<string, string>> {
		const project = this.editor.project.getActiveOrNull();
		const map = new Map<string, string>();
		if (!project) return map;
		const here = this.editor.media.getAssets();
		for (const asset of this.media) {
			if (here.some((a) => a.id === asset.id)) continue;
			const same = here.find(
				(a) => a.name === asset.name && a.file.size === asset.file.size && a.type === asset.type,
			);
			if (same) {
				map.set(asset.id, same.id);
				continue;
			}
			const { id: _id, ...rest } = asset;
			const added = await this.editor.media.addMediaAsset({
				projectId: project.metadata.id,
				asset: rest,
			});
			if (added) map.set(asset.id, added.id);
		}
		return map;
	}

	private async pasteFromOtherProject({ time }: { time?: MediaTime }): Promise<void> {
		const entry = this.entry;
		if (!entry || entry.type !== "elements") return;
		const map = await this.bringMedia();
		const remapped: ClipboardEntry = {
			...entry,
			items: entry.items.map((item) =>
				"mediaId" in item.element && typeof item.element.mediaId === "string" && map.has(item.element.mediaId)
					? { ...item, element: { ...item.element, mediaId: map.get(item.element.mediaId) ?? item.element.mediaId } }
					: item,
			),
		};
		const command = buildPasteClipboardCommand({
			entry: remapped,
			context: this.getPasteContext({ time }),
		});
		if (command) this.editor.command.execute({ command });
	}

	paste({ time }: { time?: MediaTime } = {}): boolean {
		if (!this.entry) {
			return false;
		}
		const here = this.editor.project.getActiveOrNull()?.metadata.id ?? null;
		if (this.entry.type === "elements" && this.sourceProjectId && here !== this.sourceProjectId && this.media.length > 0) {
			const at = time ?? this.editor.playback.getCurrentTime();
			void this.pasteFromOtherProject({ time: at });
			return true;
		}

		const command = buildPasteClipboardCommand({
			entry: this.entry,
			context: this.getPasteContext({ time }),
		});
		if (!command) {
			return false;
		}

		this.editor.command.execute({ command });
		return true;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private getCopyContext(): CopyContext {
		return {
			editor: this.editor,
			selectedElements: this.editor.selection.getSelectedElements(),
			selectedKeyframes: this.editor.selection.getSelectedKeyframes(),
		};
	}

	private getPasteContext({ time }: { time?: MediaTime }): PasteContext {
		return {
			editor: this.editor,
			selectedElements: this.editor.selection.getSelectedElements(),
			selectedKeyframes: this.editor.selection.getSelectedKeyframes(),
			time: time ?? this.editor.playback.getCurrentTime(),
		};
	}

	private notify(): void {
		this.listeners.forEach((listener) => {
			listener();
		});
	}
}
