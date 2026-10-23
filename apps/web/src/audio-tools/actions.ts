"use client";

import { BatchCommand } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import { ApplyTracksCommand } from "@/commands/timeline/apply-tracks";
import type { EditorCore } from "@/core";
import { audioBufferToWav } from "@/export/master";
import { processMediaAssets } from "@/media/processing";
import type { AudioElement, SceneTracks } from "@/timeline/types";
import { withTake } from "@/recording/punch";
import { generateUUID } from "@/utils/id";
import { TICKS_PER_SECOND } from "@/wasm";
import { duckKeys, silencePlan, speechRanges } from "./dsp";
import { applyKeepRanges, duckChannel } from "./timeline";
import { cleanUpVoice, monoMix } from "./voice";

function mediaIdOf(element: AudioElement): string {
	if (!("mediaId" in element) || typeof element.mediaId !== "string")
		throw new Error("This clip isn't from an imported file");
	return element.mediaId;
}

async function decode({
	editor,
	mediaId,
}: {
	editor: EditorCore;
	mediaId: string;
}): Promise<AudioBuffer> {
	const asset = editor.media.getAssets().find((a) => a.id === mediaId);
	if (!asset) throw new Error("The clip's file is missing");
	const context = new AudioContext();
	try {
		return await context.decodeAudioData(await asset.file.arrayBuffer());
	} finally {
		void context.close();
	}
}

function mapElement({
	tracks,
	elementId,
	change,
}: {
	tracks: SceneTracks;
	elementId: string;
	change: (element: AudioElement) => AudioElement;
}): SceneTracks {
	return {
		...tracks,
		audio: tracks.audio.map((t) => ({
			...t,
			elements: t.elements.map((e) => (e.id === elementId ? change(e) : e)),
		})),
	};
}

/** Clean up voice (AR-15): a new cleaned file replaces the clip's audio; the original is kept. */
export async function cleanUpClipVoice({
	editor,
	element,
}: {
	editor: EditorCore;
	element: AudioElement;
}) {
	const mediaId = mediaIdOf(element);
	const buffer = await decode({ editor, mediaId });
	const cleaned = await cleanUpVoice(buffer);
	const name = `${element.name.replace(/\.[^.]+$/, "")} (clean).wav`;
	const [asset] = await processMediaAssets({
		files: [new File([audioBufferToWav(cleaned)], name, { type: "audio/wav" })],
	});
	if (!asset) throw new Error("Couldn't save the cleaned audio");
	const addMedia = new AddMediaAssetCommand({
		projectId: editor.project.getActive().metadata.id,
		asset,
	});
	const tracks = mapElement({
		tracks: editor.scenes.getActiveScene().tracks,
		elementId: element.id,
		change: (e) =>
			e.sourceType === "upload"
				? {
						...e,
						mediaId: addMedia.getAssetId(),
						voiceCleanup: {
							originalMediaId: element.voiceCleanup?.originalMediaId ?? mediaId,
						},
					}
				: e,
	});
	editor.command.execute({
		command: new BatchCommand([addMedia, new ApplyTracksCommand(tracks)]),
	});
}

/** Put the original recording back. */
export function restoreOriginalVoice({
	editor,
	element,
}: {
	editor: EditorCore;
	element: AudioElement;
}) {
	const original = element.voiceCleanup?.originalMediaId;
	if (!original) return;
	const tracks = mapElement({
		tracks: editor.scenes.getActiveScene().tracks,
		elementId: element.id,
		change: (e) =>
			e.sourceType === "upload"
				? { ...e, mediaId: original, voiceCleanup: undefined }
				: e,
	});
	editor.command.execute({ command: new ApplyTracksCommand(tracks) });
}

/** Silence trim (AR-17). Returns the seconds removed. */
export async function trimClipSilence({
	editor,
	element,
	trackId,
	shortenPauses,
}: {
	editor: EditorCore;
	element: AudioElement;
	trackId: string;
	shortenPauses: boolean;
}): Promise<number> {
	const buffer = await decode({ editor, mediaId: mediaIdOf(element) });
	const speech = speechRanges({
		samples: monoMix(buffer),
		sampleRate: buffer.sampleRate,
	});
	const keep = silencePlan({
		speech,
		duration: buffer.duration,
		shortenPauses,
	});
	if (!keep.length) throw new Error("No speech found in this clip");
	const before = editor.scenes.getActiveScene().tracks;
	const next = applyKeepRanges({
		tracks: before,
		trackId,
		elementId: element.id,
		keep,
		ticksPerSecond: TICKS_PER_SECOND,
		makeId: generateUUID,
	});
	const length = (tracks: SceneTracks) =>
		tracks.audio
			.find((t) => t.id === trackId)
			?.elements.reduce((sum, e) => sum + e.duration, 0) ?? 0;
	const removed = (length(before) - length(next)) / TICKS_PER_SECOND;
	if (removed > 0.01)
		editor.command.execute({ command: new ApplyTracksCommand(next) });
	return removed;
}

/** Auto-duck (AR-16): music on the other audio tracks dips while this clip speaks. Returns clips ducked. */
export async function duckUnderVoice({
	editor,
	element,
	trackId,
}: {
	editor: EditorCore;
	element: AudioElement;
	trackId: string;
}): Promise<number> {
	const buffer = await decode({ editor, mediaId: mediaIdOf(element) });
	const rate = element.retime?.rate ?? 1;
	const srcStart = element.trimStart / TICKS_PER_SECOND;
	const start = element.startTime / TICKS_PER_SECOND;
	const end = start + element.duration / TICKS_PER_SECOND;
	const speech = speechRanges({
		samples: monoMix(buffer),
		sampleRate: buffer.sampleRate,
	})
		.map(
			([a, b]) =>
				[start + (a - srcStart) / rate, start + (b - srcStart) / rate] as [
					number,
					number,
				],
		)
		.map(([a, b]) => [Math.max(a, start), Math.min(b, end)] as [number, number])
		.filter(([a, b]) => b > a);
	const keys = duckKeys({ speech });
	let count = 0;
	const tracks = editor.scenes.getActiveScene().tracks;
	const next: SceneTracks = {
		...tracks,
		audio: tracks.audio.map((t) =>
			t.id === trackId
				? t
				: {
						...t,
						elements: t.elements.map((e) => {
							const base =
								typeof e.params.volume === "number" ? e.params.volume : 0;
							const channel = duckChannel({
								element: e,
								keys,
								baseDb: base,
								ticksPerSecond: TICKS_PER_SECOND,
								makeId: generateUUID,
							});
							if (!channel) return e;
							count += 1;
							return { ...e, animations: { ...e.animations, volume: channel } };
						}),
					},
		),
	};
	if (count) editor.command.execute({ command: new ApplyTracksCommand(next) });
	return count;
}

/** Switch the clip to another take (AR-06). */
export function switchTake({ editor, element, index }: { editor: EditorCore; element: AudioElement; index: number }) {
	const tracks = mapElement({
		tracks: editor.scenes.getActiveScene().tracks,
		elementId: element.id,
		change: (e) => (e.sourceType === "upload" ? withTake({ element: e, index }) : e),
	});
	editor.command.execute({ command: new ApplyTracksCommand(tracks) });
}
