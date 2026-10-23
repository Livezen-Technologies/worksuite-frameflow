import { Command } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline/types";

/** Replaces the open sequence's tracks with a computed result, as one undo step. */
export class ApplyTracksCommand extends Command {
	private saved: SceneTracks | null = null;

	constructor(private next: SceneTracks) {
		super();
	}

	execute() {
		const editor = EditorCore.getInstance();
		this.saved = editor.scenes.getActiveScene().tracks;
		editor.timeline.updateTracks(this.next);
		return undefined;
	}

	undo() {
		if (this.saved) EditorCore.getInstance().timeline.updateTracks(this.saved);
	}
}
