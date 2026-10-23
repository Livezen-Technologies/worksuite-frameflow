import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks } from "@/timeline";
import { EditorCore } from "@/core";
import { updateTrackInSceneTracks } from "@/timeline";

/** Locks or unlocks a track (SRS ED-14). */
export class ToggleTrackLockCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(private trackId: string) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		editor.timeline.updateTracks(
			updateTrackInSceneTracks({
				tracks: this.savedState,
				trackId: this.trackId,
				update: (track) => ({ ...track, locked: !track.locked }),
			}),
		);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
