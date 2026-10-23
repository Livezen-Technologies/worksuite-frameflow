"use client";

import type { EditorCore } from "@/core";
import { TICKS_PER_SECOND } from "@/wasm";
import { templateFromElements } from "./custom";
import type { AspectId, Pack, PackTemplate } from "./types";

/** The selected titles and shapes as a template for a custom pack (SP-11). */
export function templateFromSelection({
	editor,
	pack,
	name,
	aspect,
}: {
	editor: EditorCore;
	pack: Pack;
	name: string;
	aspect: AspectId;
}): PackTemplate | null {
	const selected = editor.selection.getSelectedElements();
	const found = editor.timeline.getElementsWithTracks({ elements: selected });
	return templateFromElements({
		elements: found.map(({ element }) => element),
		frame: editor.project.getActive().settings.canvasSize,
		ticksPerSecond: TICKS_PER_SECOND,
		pack,
		name,
		aspect,
	});
}
