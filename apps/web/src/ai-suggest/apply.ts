import { ApplyTracksCommand } from "@/commands/timeline/apply-tracks";
import type { EditorCore } from "@/core";
import { reflowElements } from "@/project-settings/reflow";
import { applyPatches, copyTracks } from "@/sequences/copy";
import { addSequence, sizeForShape } from "@/sequences/service";
import { cutTimeRange } from "@/timeline/cut-range";
import type { VideoElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import { TICKS_PER_SECOND } from "@/wasm";
import { applyReframe } from "./reframe";
import { type Suggestion, useSuggestions } from "./store";

const CAPTION_LOOKS: Record<string, string> = {
	"word highlight": "highlight",
	"word by word": "words",
};

/** An approved clip becomes its own sequence (AI-52, AI-53). */
async function approveClip({ editor, suggestion }: { editor: EditorCore; suggestion: Suggestion }) {
	const source = editor.scenes.getActiveScene().tracks;
	const total = editor.timeline.getTotalDuration();
	const start = Math.round(suggestion.start * TICKS_PER_SECOND);
	const end = Math.round(suggestion.end * TICKS_PER_SECOND);
	let tracks = copyTracks(source);
	tracks = cutTimeRange({ tracks, start: end, end: Math.max(end, total), makeId: generateUUID });
	tracks = cutTimeRange({ tracks, start: 0, end: start, makeId: generateUUID });
	const look = CAPTION_LOOKS[suggestion.captionStyle ?? ""];
	if (look)
		tracks = {
			...tracks,
			overlay: tracks.overlay.map((t) =>
				t.type !== "text"
					? t
					: {
							...t,
							elements: t.elements.map((e) => ({
								...e,
								params: { ...e.params, "animation.caption": look },
							})),
						},
			),
		};
	const from = editor.project.getActive().settings.canvasSize;
	const vertical = suggestion.layout === "vertical";
	const size = vertical ? sizeForShape({ ratio: [9, 16], current: from }) : from;
	if (vertical)
		tracks = applyPatches({
			tracks,
			patches: reflowElements({
				tracks,
				assets: editor.media.getAssets(),
				from,
				to: size,
				mode: "fill",
			}),
		});
	await addSequence({ editor, name: suggestion.title?.trim() || "Clip", tracks, size });
}

function approveReframe({ editor, suggestion }: { editor: EditorCore; suggestion: Suggestion }) {
	const assets = editor.media.getAssets();
	const next = applyReframe({
		tracks: editor.scenes.getActiveScene().tracks,
		start: Math.round(suggestion.start * TICKS_PER_SECOND),
		end: Math.round(suggestion.end * TICKS_PER_SECOND),
		x: suggestion.x ?? 0.5,
		frame: editor.project.getActive().settings.canvasSize,
		aspectOf: (element: VideoElement) => {
			const asset = assets.find((a) => a.id === element.mediaId);
			return asset?.width && asset.height ? asset.width / asset.height : 16 / 9;
		},
		makeId: generateUUID,
	});
	editor.command.execute({ command: new ApplyTracksCommand(next) });
}

export async function approveSuggestion({
	editor,
	suggestion,
}: {
	editor: EditorCore;
	suggestion: Suggestion;
}) {
	if (suggestion.kind === "clip") await approveClip({ editor, suggestion });
	else if (suggestion.kind === "reframe") approveReframe({ editor, suggestion });
	useSuggestions.getState().setStatus({
		projectId: editor.project.getActive().metadata.id,
		id: suggestion.id,
		status: "approved",
	});
}

export function rejectSuggestion({ editor, id }: { editor: EditorCore; id: string }) {
	useSuggestions.getState().setStatus({
		projectId: editor.project.getActive().metadata.id,
		id,
		status: "rejected",
	});
}
