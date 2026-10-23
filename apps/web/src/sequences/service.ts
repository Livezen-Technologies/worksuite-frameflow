import type { EditorCore } from "@/core";
import type { TCanvasSize } from "@/project/types";
import { reflowElements, type ReflowMode } from "@/project-settings/reflow";
import { applyPatches, copyTracks } from "./copy";

export const SEQUENCE_SHAPES: { id: string; label: string; ratio: [number, number] }[] = [
	{ id: "16:9", label: "16:9 landscape", ratio: [16, 9] },
	{ id: "9:16", label: "9:16 vertical", ratio: [9, 16] },
	{ id: "1:1", label: "1:1 square", ratio: [1, 1] },
	{ id: "4:5", label: "4:5 portrait", ratio: [4, 5] },
];

/** Same short side as the current frame, in the new shape, even pixels. */
export function sizeForShape({
	ratio,
	current,
}: {
	ratio: [number, number];
	current: TCanvasSize;
}): TCanvasSize {
	const short = Math.min(current.width, current.height);
	const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
	const [w, h] = ratio;
	return w >= h
		? { width: even((short * w) / h), height: even(short) }
		: { width: even(short), height: even((short * h) / w) };
}

/**
 * Adds a sequence (ED-18): a copy of the open one in another shape, sharing
 * the same media, then opens it.
 */
export async function createSequence({
	editor,
	shape,
	mode = "fill",
}: {
	editor: EditorCore;
	shape: (typeof SEQUENCE_SHAPES)[number];
	mode?: ReflowMode;
}): Promise<string> {
	const project = editor.project.getActive();
	const from = project.settings.canvasSize;
	const to = sizeForShape({ ratio: shape.ratio, current: from });
	const source = editor.scenes.getActiveScene();
	const copied = copyTracks(source.tracks);
	const tracks = applyPatches({
		tracks: copied,
		patches: reflowElements({
			tracks: copied,
			assets: editor.media.getAssets(),
			from,
			to,
			mode,
		}),
	});
	const id = await editor.scenes.createScene({
		name: `${source.name.replace(/ \(\d+:\d+\)$/, "")} (${shape.id})`,
		isMain: false,
	});
	editor.scenes.setScenes({
		scenes: editor.scenes
			.getScenes()
			.map((s) => (s.id === id ? { ...s, tracks, canvasSize: to } : s)),
	});
	await editor.scenes.switchToScene({ sceneId: id });
	return id;
}

/** "16:9", "9:16"… for a frame size, or its pixels when unusual. */
export function shapeLabel(size: TCanvasSize): string {
	const r = size.width / size.height;
	const match = SEQUENCE_SHAPES.find(
		(s) => Math.abs(s.ratio[0] / s.ratio[1] - r) < 0.01,
	);
	return match ? match.id : `${size.width}×${size.height}`;
}
