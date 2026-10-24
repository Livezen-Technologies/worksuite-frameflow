import { create } from "zustand";
import type { MediaTime } from "@/wasm";
import type { PackType } from "./types";

/*
 * Dropping (or "Download & Add"-ing) a pack that isn't installed yet
 * (blueprint §9–§10):
 *
 *   1. a placeholder clip goes where it was dropped (or the target clip /
 *      cut shows a progress ring) — outside the undo history;
 *   2. the pack installs (the desktop store installs dependencies first);
 *   3. the placeholder comes out, again outside the history, and the real
 *      add/apply runs through the normal commands; every step it takes is
 *      then squashed into ONE undo step;
 *   4. cancelling (or a failed download) just removes the placeholder.
 *
 * So the history only ever sees the finished add, as one step, whatever
 * the user did in the timeline while the pack was downloading.
 */

/** Where a pack was dropped. */
export type PackDropTarget =
	/** On a track at a time (graphics, motion, sounds, text): a new clip. */
	| { kind: "track"; trackId: string | null; startTime: MediaTime; trackIndex?: number; isNewTrack?: boolean }
	/** On a clip (LUTs, filters, effects, text animations): applied to it. */
	| { kind: "clip"; trackId: string; elementId: string }
	/** On a cut (transitions): `elementId` is the clip after the cut. */
	| { kind: "cut"; trackId: string; elementId: string; maxSeconds: number }
	/** Download & Add: the default action on the playhead / selection. */
	| { kind: "default" };

export interface PackDropRequest {
	packId: string;
	packType: PackType;
	title: string;
	/** One item of the pack; its first item when absent. */
	itemId?: string | null;
	target: PackDropTarget;
	/** False for packs that apply to something instead of adding a clip. */
	placeholder?: boolean;
}

export interface PlaceholderRef {
	trackId: string;
	elementId: string;
	/** The placeholder made a new track: removed with it. */
	newTrack: boolean;
}

export type PackDropOutcome = "added" | "cancelled" | "failed";

export interface PackDropDeps {
	/** Inserts the placeholder without touching the undo history. */
	insertPlaceholder: () => PlaceholderRef | null;
	/** Removes it, without touching the undo history. */
	removePlaceholder: (ref: PlaceholderRef) => void;
	/** Resolves true when installed, false when cancelled; throws on failure. */
	install: () => Promise<boolean>;
	cancelInstall: () => void;
	/** The editor's undo history. */
	history: { mark: () => number; squash: (args: { mark: number }) => void };
	/** The real add/apply, through normal commands. */
	perform: () => Promise<void> | void;
	onError?: (error: unknown) => void;
}

export interface PackDropView {
	id: string;
	packId: string;
	title: string;
	kind: PackDropTarget["kind"];
	/** The placeholder clip, or the clip the ring is drawn on. */
	ring: { trackId: string; elementId: string } | null;
	placeholder: PlaceholderRef | null;
}

interface PackDropStore {
	drops: Record<string, PackDropView>;
	cancels: Record<string, () => void>;
}

/** Drops in progress, for the timeline's progress rings. */
export const usePackDrops = create<PackDropStore>(() => ({ drops: {}, cancels: {} }));

/** Placeholder clips of drops that already ended (an undo of an unrelated step could bring one back). */
export const finishedPlaceholders = new Set<string>();

let nextId = 1;

/** Runs one drop; see the comment at the top. */
export function runPackDrop({ request, deps }: { request: PackDropRequest; deps: PackDropDeps }): { id: string; cancel: () => void; done: Promise<PackDropOutcome> } {
	const id = `drop-${nextId++}`;
	let cancelled = false;
	let placeholder: PlaceholderRef | null = null;
	const target = request.target;
	const clear = () => {
		if (placeholder) {
			deps.removePlaceholder(placeholder);
			finishedPlaceholders.add(placeholder.elementId);
			placeholder = null;
		}
		usePackDrops.setState((s) => {
			const { [id]: _drop, ...drops } = s.drops;
			const { [id]: _cancel, ...cancels } = s.cancels;
			return { drops, cancels };
		});
	};
	const cancel = () => {
		if (cancelled) return;
		cancelled = true;
		deps.cancelInstall();
		clear();
	};

	if ((target.kind === "track" || target.kind === "default") && request.placeholder !== false) placeholder = deps.insertPlaceholder();
	const ring = placeholder ? { trackId: placeholder.trackId, elementId: placeholder.elementId } : target.kind === "clip" || target.kind === "cut" ? { trackId: target.trackId, elementId: target.elementId } : null;
	usePackDrops.setState((s) => ({
		drops: { ...s.drops, [id]: { id, packId: request.packId, title: request.title, kind: target.kind, ring, placeholder } },
		cancels: { ...s.cancels, [id]: cancel },
	}));

	const done = (async (): Promise<PackDropOutcome> => {
		try {
			const ok = await deps.install();
			if (cancelled) return "cancelled";
			if (!ok) {
				cancelled = true;
				clear();
				return "cancelled";
			}
			// Out goes the placeholder (no history), in goes the real thing (one step).
			clear();
			const mark = deps.history.mark();
			try {
				await deps.perform();
			} finally {
				deps.history.squash({ mark });
			}
			return "added";
		} catch (error) {
			if (!cancelled) {
				clear();
				deps.onError?.(error);
			}
			return cancelled ? "cancelled" : "failed";
		}
	})();
	return { id, cancel, done };
}

export function cancelPackDrop(id: string) {
	usePackDrops.getState().cancels[id]?.();
}
