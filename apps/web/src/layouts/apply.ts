import type { EditorCore } from "@/core";
import { UpdateElementsCommand } from "@/commands/timeline/element";
import type { ImageElement, TimelineElement, VideoElement } from "@/timeline";
import { presenterPlacements, type PresenterLayout } from "./presenter";

type Visual = { trackId: string; element: VideoElement | ImageElement };

/**
 * Applies a presenter layout (ED-19) to two selected clips: the bigger
 * source is the screen recording, the other the camera. One undo step.
 */
export function applyPresenterLayout({
	editor,
	layout,
}: {
	editor: EditorCore;
	layout: PresenterLayout;
}): { ok: true } | { ok: false; message: string } {
	const tracks = editor.scenes.getActiveScene().tracks;
	const all = [tracks.main, ...tracks.overlay];
	const picked: Visual[] = [];
	for (const ref of editor.selection.getSelectedElements()) {
		const track = all.find((t) => t.id === ref.trackId);
		const element = track?.elements.find((e) => e.id === ref.elementId);
		if (track && (element?.type === "video" || element?.type === "image"))
			picked.push({ trackId: track.id, element });
	}
	if (picked.length !== 2)
		return {
			ok: false,
			message: "Select two clips: the screen recording and the camera.",
		};
	const assets = editor.media.getAssets();
	const info = (v: Visual) => {
		const asset = assets.find((a) => a.id === v.element.mediaId);
		const width = asset?.width ?? 16;
		const height = asset?.height ?? 9;
		return { aspect: width / height, area: width * height };
	};
	const [a, b] = picked;
	if (!a || !b) return { ok: false, message: "Select two clips." };
	const [screen, camera] = info(a).area >= info(b).area ? [a, b] : [b, a];
	const frame = editor.project.getActive().settings.canvasSize;
	const placements = presenterPlacements({
		layout,
		frame,
		screenAspect: info(screen).aspect,
		cameraAspect: info(camera).aspect,
	});
	const patch = ({
		v,
		p,
	}: {
		v: Visual;
		p: (typeof placements)["screen"];
	}): { trackId: string; elementId: string; patch: Partial<TimelineElement> } => ({
		trackId: v.trackId,
		elementId: v.element.id,
		patch: {
			hidden: !!p.hidden,
			params: {
				...v.element.params,
				"transform.positionX": p.positionX,
				"transform.positionY": p.positionY,
				"transform.scaleX": p.scale,
				"transform.scaleY": p.scale,
			},
		},
	});
	editor.command.execute({
		command: new UpdateElementsCommand({
			updates: [
				patch({ v: screen, p: placements.screen }),
				patch({ v: camera, p: placements.camera }),
			],
		}),
	});
	return { ok: true };
}
