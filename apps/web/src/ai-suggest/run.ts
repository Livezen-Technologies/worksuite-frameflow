import type { EditorCore } from "@/core";
import { aiProvider } from "@/ai/provider";
import { parseAnswer, SuggestionItem, SuggestionsAnswer, validItems } from "@/ai/schemas";
import { useTranscriptStore } from "@/transcript/store";
import { generateUUID } from "@/utils/id";
import { TICKS_PER_SECOND } from "@/wasm";
import type { PlatformLimit } from "./platforms";
import { hideAreas, useCloudPrivacy } from "./privacy";
import { buildClipRequest, buildReframeRequest, normalizeClips, reframeRanges } from "./requests";
import { useSuggestions } from "./store";

/** Clip suggestions from the transcript (SRS AI-53). */
export async function suggestClips({
	editor,
	platform,
}: {
	editor: EditorCore;
	platform: PlatformLimit;
}): Promise<number> {
	const projectId = editor.project.getActive().metadata.id;
	const transcript = useTranscriptStore.getState().byProject[projectId];
	if (!transcript?.segments.length)
		throw new Error("Make a transcript first (Captions → Generate transcript).");
	const answer = await aiProvider().rewriteText({
		request: buildClipRequest({ segments: transcript.segments, platform }),
		kind: "clip suggestions",
	});
	const { items } = validItems({
		items: parseAnswer({ text: answer.text, schema: SuggestionsAnswer }).suggestions,
		item: SuggestionItem,
	});
	const clips = normalizeClips({
		items,
		segments: transcript.segments,
		platform,
		makeId: generateUUID,
	});
	const store = useSuggestions.getState();
	store.clear({ projectId, kind: "clip" });
	store.add({ projectId, suggestions: clips });
	return clips.length;
}

/**
 * Frames sent to the cloud have the project's hidden areas blurred out
 * first (AI-50); privacy-region clips are already in the rendered frame.
 */
export async function cloudFrame({
	editor,
	seconds,
	maxSize = 512,
}: {
	editor: EditorCore;
	seconds: number;
	maxSize?: number;
}): Promise<{ data: ArrayBuffer; mimeType: string }> {
	const canvas = await editor.project.renderFrame({
		time: Math.round(seconds * TICKS_PER_SECOND),
		maxSize,
	});
	const projectId = editor.project.getActive().metadata.id;
	hideAreas({ canvas, regions: useCloudPrivacy.getState().byProject[projectId] ?? [] });
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.8),
	);
	if (!blob) throw new Error("Couldn't prepare a frame.");
	return { data: await blob.arrayBuffer(), mimeType: "image/jpeg" };
}

/** Where the subject is over time, for vertical crops (AI-53). */
export async function suggestReframe({ editor }: { editor: EditorCore }): Promise<number> {
	const duration = editor.timeline.getTotalDuration() / TICKS_PER_SECOND;
	if (duration <= 0) throw new Error("The timeline is empty.");
	const step = Math.max(2, duration / 20);
	const times: number[] = [];
	for (let t = 0; t < duration && times.length < 20; t += step) times.push(t);
	const frames = [];
	for (const t of times) frames.push(await cloudFrame({ editor, seconds: t }));
	const answer = await aiProvider().analyseFrames({
		request: buildReframeRequest({ times }),
		frames,
	});
	const { items } = validItems({
		items: parseAnswer({ text: answer.text, schema: SuggestionsAnswer }).suggestions,
		item: SuggestionItem,
	});
	const points = items
		.filter((i) => i.kind === "reframe" && i.x !== undefined)
		.map((i, index) => ({
			// Match by order when times drift; models sometimes round them.
			time: times[index] ?? i.start,
			x: i.x ?? 0.5,
			y: i.y ?? 0.5,
			confidence: i.confidence,
		}));
	const ranges = reframeRanges({ frames: points, makeId: generateUUID, duration });
	const projectId = editor.project.getActive().metadata.id;
	const store = useSuggestions.getState();
	store.clear({ projectId, kind: "reframe" });
	store.add({ projectId, suggestions: ranges });
	return ranges.length;
}
