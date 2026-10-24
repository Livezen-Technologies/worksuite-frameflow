"use client";

import type { EditorCore } from "@/core";
import { decodeAudioToFloat32 } from "@/media/audio";
import { processMediaAssets } from "@/media/processing";
import { clampDb } from "@/timeline/audio-state";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { AudioElement, VideoElement } from "@/timeline/types";
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
