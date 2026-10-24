"use client";

import type { EditorCore } from "@/core";
import { decodeAudioToFloat32 } from "@/media/audio";
import { processMediaAssets } from "@/media/processing";
import { clampDb } from "@/timeline/audio-state";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { upsertPathKeyframe } from "@/animation/keyframes";
import { BatchCommand } from "@/commands/batch-command";
import { CutTimeRangeCommand } from "@/commands/timeline/cut-range";
import { coerceParamValue, getParamChannelLayout } from "@/params";
import { getElementParam } from "@/params/registry";
import { getElementVolume } from "@/timeline/audio-state";
import { cutTranscriptRange } from "@/transcript/transcript";
import { useTranscriptStore } from "@/transcript/store";
import type { AudioElement, TimelineTrack, VideoElement } from "@/timeline/types";
import { duckKeyframes, fillerRanges, mergeIntervals, speechIntervals } from "./smart-edits";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";

type AudioClip = AudioElement | VideoElement;
const RATE = 22050;

/** The clip's own samples (mono, 22 kHz), between its trim points. */
async function clipSamples({ editor, element }: { editor: EditorCore; element: AudioClip }): Promise<Float32Array> {
	if (!("mediaId" in element)) throw new Error("This works on your own audio and video files.");
	const asset = editor.media.getAssets().find((a) => a.id === element.mediaId);
	if (!asset?.file) throw new Error("The clip's file isn't available.");
	const { samples } = await decodeAudioToFloat32({ audioBlob: asset.file, sampleRate: RATE });
	const rate = element.retime?.rate ?? 1;
	const from = Math.floor((element.trimStart / TICKS_PER_SECOND) * RATE);
	const length = Math.ceil((element.duration / TICKS_PER_SECOND) * rate * RATE);
	return samples.subarray(from, from + length);
}

function setVolume({ editor, element, trackId, db }: { editor: EditorCore; element: AudioClip; trackId: string; db: number }) {
	editor.timeline.updateElements({
		updates: [{ trackId, elementId: element.id, patch: { params: { ...element.params, volume: Math.round(clampDb(db) * 10) / 10 } } }],
	});
}

/** Normalize: the loudest peak reaches −1 dBFS. Returns the new volume in dB. */
export async function normalizeClip({ editor, element, trackId }: { editor: EditorCore; element: AudioClip; trackId: string }): Promise<number> {
	const samples = await clipSamples({ editor, element });
	let peak = 0;
	for (const v of samples) peak = Math.max(peak, Math.abs(v));
	if (peak < 1e-4) throw new Error("The clip is silent.");
	const db = -1 - 20 * Math.log10(peak);
	setVolume({ editor, element, trackId, db });
	return db;
}

/**
 * Set loudness: brings the clip's average level (RMS of the parts that
 * aren't silent) to about −16 LUFS, the usual level for podcasts and video.
 */
export async function setClipLoudness({ editor, element, trackId, target = -16 }: { editor: EditorCore; element: AudioClip; trackId: string; target?: number }): Promise<number> {
	const samples = await clipSamples({ editor, element });
	const block = 2048;
	let sum = 0;
	let count = 0;
	for (let i = 0; i + block <= samples.length; i += block) {
		let s = 0;
		for (let j = i; j < i + block; j++) s += samples[j]! * samples[j]!;
		const rms = Math.sqrt(s / block);
		if (rms > 0.003) {
			sum += s;
			count += block;
		}
	}
	if (count === 0) throw new Error("The clip is silent.");
	const rmsDb = 10 * Math.log10(sum / count);
	// RMS of speech/music reads about 3 dB under LUFS for full-band material.
	const db = target - (rmsDb + 3);
	setVolume({ editor, element, trackId, db });
	return db;
}

/** Imports audio files and puts them on the timeline at the playhead. */
export async function importAudio({ editor, files }: { editor: EditorCore; files: File[] }): Promise<number> {
	const projectId = editor.project.getActive().metadata.id;
	const processed = await processMediaAssets({ files });
	let added = 0;
	for (const item of processed) {
		const asset = await editor.media.addMediaAsset({ projectId, asset: item });
		if (!asset || asset.duration == null) continue;
		editor.timeline.insertElement({
			element: buildElementFromMedia({
				mediaId: asset.id,
				mediaType: asset.type,
				name: asset.name,
				duration: mediaTimeFromSeconds({ seconds: asset.duration }),
				startTime: editor.playback.getCurrentTime(),
			}),
			placement: { mode: "auto" },
		});
		added++;
	}
	return added;
}

const isAudioClip = (e: TimelineTrack["elements"][number]): e is AudioClip => e.type === "audio" || e.type === "video";

/** Where someone is speaking on these tracks, in timeline seconds. */
async function speechOn({ editor, tracks }: { editor: EditorCore; tracks: TimelineTrack[] }) {
	const hop = 0.05;
	const block = Math.round(RATE * hop);
	const found: { start: number; end: number }[] = [];
	for (const track of tracks) {
		if ("muted" in track && track.muted) continue;
		for (const element of track.elements.filter(isAudioClip)) {
			const samples = await clipSamples({ editor, element }).catch(() => null);
			if (!samples?.length) continue;
			const rms = new Float32Array(Math.floor(samples.length / block));
			for (let i = 0; i < rms.length; i++) {
				let sum = 0;
				for (let j = i * block; j < (i + 1) * block; j++) sum += samples[j]! * samples[j]!;
				rms[i] = Math.sqrt(sum / block);
			}
			// Speech sits well above the room's noise floor (the quietest 20 %).
			const sorted = [...rms].sort((a, b) => a - b);
			const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
			const threshold = Math.max(0.01, floor * 4);
			const rate = element.retime?.rate ?? 1;
			found.push(
				...speechIntervals({ rms, hop: hop / rate, offset: element.startTime / TICKS_PER_SECOND, threshold }),
			);
		}
	}
	return mergeIntervals({ intervals: found });
}

/**
 * Auto-ducking (AE-06): turns the music down while someone speaks, with
 * volume keyframes on every clip of the music track (one undo step).
 * Returns how many spoken phrases it ducked under.
 */
export async function duckMusic({
	editor,
	musicTrackId,
	voiceTrackIds,
	depth,
	release,
}: {
	editor: EditorCore;
	musicTrackId: string;
	voiceTrackIds: string[];
	depth: number;
	release: number;
}): Promise<number> {
	const scene = editor.scenes.getActiveScene().tracks;
	const all: TimelineTrack[] = [scene.main, ...scene.overlay, ...scene.audio];
	const music = all.find((t) => t.id === musicTrackId);
	if (!music) throw new Error("Pick the music track.");
	const speech = await speechOn({ editor, tracks: all.filter((t) => voiceTrackIds.includes(t.id) && t.id !== musicTrackId) });
	if (!speech.length) throw new Error("No speech found on the voice track.");
	const updates = music.elements.filter(isAudioClip).map((element) => {
		const param = getElementParam({ element, key: "volume" });
		const { volume: _old, ...rest } = element.animations ?? {};
		let animations = Object.keys(rest).length ? rest : undefined;
		if (param) {
			for (const key of duckKeyframes({
				speech,
				clipStart: element.startTime / TICKS_PER_SECOND,
				clipDuration: element.duration / TICKS_PER_SECOND,
				base: getElementVolume({ element }),
				depth,
				release,
			})) {
				animations = upsertPathKeyframe({
					animations,
					propertyPath: "volume",
					time: mediaTimeFromSeconds({ seconds: key.time }),
					value: key.value,
					channelLayout: getParamChannelLayout({ param }),
					coerceValue: ({ value }) => coerceParamValue({ param, value }),
				});
			}
		}
		return { trackId: music.id, elementId: element.id, patch: { animations } };
	});
	editor.timeline.updateElements({ updates });
	return speech.length;
}

/** Takes the ducking (all volume keyframes) off the music track. */
export function removeDucking({ editor, musicTrackId }: { editor: EditorCore; musicTrackId: string }) {
	const scene = editor.scenes.getActiveScene().tracks;
	const music = [scene.main, ...scene.overlay, ...scene.audio].find((t) => t.id === musicTrackId);
	if (!music) return;
	editor.timeline.updateElements({
		updates: music.elements.filter(isAudioClip).map((element) => {
			const { volume: _old, ...rest } = element.animations ?? {};
			return { trackId: music.id, elementId: element.id, patch: { animations: Object.keys(rest).length ? rest : undefined } };
		}),
	});
}

/**
 * Removes filler words (AE-03) using the transcript's word timings: each
 * one is cut from the whole timeline, all in one undo step. Returns the
 * cuts made, or null when there's no transcript with word timings.
 */
export function removeFillerWords({ editor, fillers }: { editor: EditorCore; fillers?: string[] }): { count: number; seconds: number } | null {
	const projectId = editor.project.getActive().metadata.id;
	const store = useTranscriptStore.getState();
	const before = store.byProject[projectId];
	if (!before?.segments.some((s) => s.words?.length)) return null;
	const ranges = fillerRanges({ transcript: before, fillers });
	if (!ranges.length) return { count: 0, seconds: 0 };
	// Latest first, so earlier times stay valid as the timeline closes up.
	const descending = [...ranges].reverse();
	const after = descending.reduce((t, r) => cutTranscriptRange({ transcript: t, start: r.start, end: r.end }), before);
	const save = (transcript: typeof before) => useTranscriptStore.getState().setTranscript({ projectId, transcript });
	editor.command.execute({
		command: new BatchCommand(
			descending.map(
				(r, i) =>
					new CutTimeRangeCommand({
						start: mediaTimeFromSeconds({ seconds: r.start }),
						end: mediaTimeFromSeconds({ seconds: r.end }),
						onExecute: i === descending.length - 1 ? () => save(after) : undefined,
						onUndo: i === 0 ? () => save(before) : undefined,
					}),
			),
		),
	});
	return { count: ranges.length, seconds: ranges.reduce((n, r) => n + r.end - r.start, 0) };
}
