import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { TimelineGrade, TScene } from "@/timeline";
import { updateSceneInArray } from "@/timeline/scenes";

/** Replaces the open sequence's timeline grade (WS-12), as one undo step. */
export class SetTimelineGradeCommand extends Command {
	private savedScenes: TScene[] | null = null;

	constructor(private readonly grade: TimelineGrade | undefined) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];
		const scene = editor.scenes.getActiveScene();
		editor.scenes.setScenes({
			scenes: updateSceneInArray({
				scenes,
				sceneId: scene.id,
				updates: { grade: this.grade, updatedAt: new Date() },
			}),
		});
		return undefined;
	}

	undo(): void {
		if (this.savedScenes) EditorCore.getInstance().scenes.setScenes({ scenes: this.savedScenes });
	}
}
