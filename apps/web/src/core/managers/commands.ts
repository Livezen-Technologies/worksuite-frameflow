import type { EditorCore } from "@/core";
import type { Command, CommandResult } from "@/commands";
import type { EditorSelectionSnapshot } from "@/selection/editor-selection";
import { applyRippleAdjustments, computeRippleAdjustments } from "@/ripple";
import type { SceneTracks } from "@/timeline/types";
import { toast } from "sonner";

/** Elements of each locked track, to spot edits that touch them (ED-14). */
function lockedSnapshot(tracks: SceneTracks | null): Map<string, string> {
	const out = new Map<string, string>();
	if (!tracks) return out;
	for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio])
		if (track.locked) out.set(track.id, JSON.stringify(track.elements));
	return out;
}

function touchesLocked({
	before,
	after,
}: {
	before: Map<string, string>;
	after: SceneTracks | null;
}): boolean {
	if (before.size === 0 || !after) return false;
	const now = new Map(
		[after.main, ...after.overlay, ...after.audio].map((t) => [t.id, t]),
	);
	for (const [id, elements] of before) {
		const track = now.get(id);
		// Removing a locked track, or changing its clips, is blocked.
		if (!track || JSON.stringify(track.elements) !== elements) return true;
	}
	return false;
}

export interface CommandHistorySnapshot {
	history: CommandHistoryEntry[];
	redoStack: CommandHistoryEntry[];
}

interface CommandHistoryEntry {
	command: Command;
	previousSelection: EditorSelectionSnapshot;
	selectionOverride?: EditorSelectionSnapshot;
}

export class CommandManager {
	public isRippleEnabled = false;
	private history: CommandHistoryEntry[] = [];
	private redoStack: CommandHistoryEntry[] = [];
	private reactors: Array<() => void> = [];

	constructor(private editor: EditorCore) {}

	/** Undo/redo of the open project, kept per project tab (SRS MP-05). */
	takeHistory(): CommandHistorySnapshot {
		const snapshot = { history: this.history, redoStack: this.redoStack };
		this.history = [];
		this.redoStack = [];
		return snapshot;
	}

	restoreHistory(snapshot: CommandHistorySnapshot | null): void {
		this.history = snapshot?.history ?? [];
		this.redoStack = snapshot?.redoStack ?? [];
	}

	execute({ command }: { command: Command }): Command {
		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const locked = lockedSnapshot(
			this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null,
		);
		const result = command.execute();
		if (
			touchesLocked({
				before: locked,
				after: this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null,
			})
		) {
			command.undo();
			toast.error("That track is locked", {
				description: "Unlock it in the track header to edit it.",
			});
			return command;
		}
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();
		this.history.push({
			command,
			previousSelection,
			selectionOverride,
		});
		this.redoStack = [];
		return command;
	}

	push({ command }: { command: Command }): void {
		this.history.push({
			command,
			previousSelection: this.getSelectionSnapshot(),
		});
		this.redoStack = [];
	}

	registerReactor(reactor: () => void): void {
		this.reactors.push(reactor);
	}

	undo(): void {
		if (this.history.length === 0) return;
		const entry = this.history.pop();
		entry?.command.undo();
		if (entry) {
			// Only restore selection for commands that explicitly changed it.
			// Commands without selection intent leave selection untouched,
			// preserving any UI-driven selection changes (clicks, box select)
			// that happened between commands. Commands that remove editor-owned
			// selection targets must declare a selection override to clear stale refs.
			if (entry.selectionOverride !== undefined) {
				this.editor.selection.restoreSnapshot({
					snapshot: entry.previousSelection,
				});
			}
			this.redoStack.push(entry);
		}
	}

	redo(): void {
		if (this.redoStack.length === 0) return;
		const entry = this.redoStack.pop();
		if (!entry) {
			return;
		}

		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = entry.command.redo();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors();

		this.history.push({
			command: entry.command,
			previousSelection,
			selectionOverride,
		});
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		this.history = [];
		this.redoStack = [];
	}

	private getSelectionSnapshot(): EditorSelectionSnapshot {
		return this.editor.selection.getSnapshot();
	}

	private applySelectionOverride(
		result: CommandResult | undefined,
	): EditorSelectionSnapshot | undefined {
		if (!result?.selection) {
			return undefined;
		}
		return this.editor.selection.applySelectionPatch({
			patch: result.selection,
		});
	}

	private runReactors(): void {
		for (const reactor of this.reactors) {
			reactor();
		}
	}

	private applyRippleIfEnabled({
		beforeTracks,
	}: {
		beforeTracks: SceneTracks | null;
	}): void {
		if (!this.isRippleEnabled || !beforeTracks) {
			return;
		}

		const afterTracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!afterTracks) {
			return;
		}
		const adjustments = computeRippleAdjustments({
			beforeTracks,
			afterTracks,
		});
		if (adjustments.length === 0) {
			return;
		}

		const tracksWithRipple = applyRippleAdjustments({
			tracks: afterTracks,
			adjustments,
		});
		this.editor.timeline.updateTracks(tracksWithRipple);
	}
}
