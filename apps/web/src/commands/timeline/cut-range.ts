import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { cutTimeRange } from "@/timeline/cut-range";
import { generateUUID } from "@/utils/id";

/** Removes [start, end) from the whole timeline and closes the gap (ED-17). */
export class CutTimeRangeCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(
		private readonly range: {
			start: number;
			end: number;
			/** Keeps other state (the transcript) in step with execute/undo. */
			onExecute?: () => void;
			onUndo?: () => void;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		editor.timeline.updateTracks(
			cutTimeRange({
				tracks: this.savedState,
				start: this.range.start,
				end: this.range.end,
				makeId: generateUUID,
			}),
		);
		this.range.onExecute?.();
		return {
			selection: {
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		};
	}

	undo(): void {
		if (!this.savedState) return;
		EditorCore.getInstance().timeline.updateTracks(this.savedState);
		this.range.onUndo?.();
	}
}
