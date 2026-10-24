"use client";

import type { EditorCore } from "@/core";
import { type AudioExportFormat, encodeAudioFile, supportedAudioFormats } from "@/export/audio-export";
import { audioBufferToWav, masterBridge } from "@/export/master";
import { createTimelineAudioBuffer } from "@/media/audio";
import type { SceneTracks } from "@/timeline/types";
import { type LoudnessReport, measureBuffer } from "./loudness";

const RATE = 48000;

/** The project's mix (or the given tracks), as the export hears it. */
export async function renderMix({ editor, tracks, channels = 2 }: { editor: EditorCore; tracks?: SceneTracks; channels?: 1 | 2 }): Promise<AudioBuffer> {
	const buffer = await createTimelineAudioBuffer({
		tracks: tracks ?? editor.scenes.getActiveScene().tracks,
		mediaAssets: editor.media.getAssets(),
		duration: editor.timeline.getTotalDuration(),
		sampleRate: RATE,
		channels,
	});
	if (!buffer) throw new Error("There's no audio on the timeline.");
	return buffer;
}

function scaled({ buffer, gain }: { buffer: AudioBuffer; gain: number }): AudioBuffer {
	const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const src = buffer.getChannelData(c);
		const dst = out.getChannelData(c);
		for (let i = 0; i < src.length; i++) dst[i] = src[i]! * gain;
	}
	return out;
}

async function limit({ buffer, ceilingDb }: { buffer: AudioBuffer; ceilingDb: number }): Promise<AudioBuffer> {
	const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	const l = ctx.createDynamicsCompressor();
	l.threshold.value = ceilingDb - 1.5;
	l.knee.value = 0;
	l.ratio.value = 20;
	l.attack.value = 0.001;
	l.release.value = 0.08;
	source.connect(l).connect(ctx.destination);
	source.start(0);
	return ctx.startRendering();
}

/**
 * Brings a mix to a loudness target (AE-09): gain to the integrated LUFS,
 * then limiting so the true peak stays under the ceiling.
 */
export async function masterToTarget({ buffer, lufs, peak }: { buffer: AudioBuffer; lufs: number; peak: number }): Promise<{ buffer: AudioBuffer; before: LoudnessReport; after: LoudnessReport }> {
	const before = measureBuffer(buffer);
	if (!Number.isFinite(before.integrated)) throw new Error("The mix is silent.");
	let out = scaled({ buffer: buffer, gain: 10 ** ((lufs - before.integrated) / 20) });
	let after = measureBuffer(out);
	for (let pass = 0; pass < 3 && after.truePeak > peak; pass++) {
		out = await limit({ buffer: out, ceilingDb: peak });
		// The limiter loses a little loudness; win it back without going over.
		const now = measureBuffer(out);
		const back = Math.min(lufs - now.integrated, peak - now.truePeak);
		out = scaled({ buffer: out, gain: 10 ** (Math.max(-6, back) / 20) });
		after = measureBuffer(out);
	}
	if (after.truePeak > peak) {
		out = scaled({ buffer: out, gain: 10 ** ((peak - after.truePeak - 0.05) / 20) });
		after = measureBuffer(out);
	}
	return { buffer: out, before, after };
}

export async function encodeMaster({ buffer, format, bitrate }: { buffer: AudioBuffer; format: AudioExportFormat; bitrate?: number }): Promise<ArrayBuffer> {
	if (format === "wav") return encodeAudioFile({ buffer, format });
	const bridge = masterBridge();
	if (!(await supportedAudioFormats()).has(format) && bridge) {
		return bridge.encodeAudio({ data: audioBufferToWav(buffer), format });
	}
	return encodeAudioFile({ buffer, format, bitrate });
}

/** One stem per audio track, plus the video's own sound when it has any. */
export function stemTracks(tracks: SceneTracks): { name: string; tracks: SceneTracks }[] {
	const mute = <T,>(t: T): T => (t && typeof t === "object" && "muted" in t ? { ...t, muted: true } : t);
	const stems = tracks.audio.map((track, i) => ({
		name: track.elements[0]?.name.replace(/\.[^.]+$/, "") || `Audio ${i + 1}`,
		tracks: { main: mute(tracks.main), overlay: tracks.overlay.map(mute), audio: tracks.audio.map((t, j) => (j === i ? t : mute(t))) },
	}));
	if (tracks.main.elements.length) stems.unshift({ name: "Video sound", tracks: { ...tracks, audio: tracks.audio.map(mute) } });
	return stems;
}

/** Saves bytes with the desktop save dialog, or downloads them on the web. */
export async function saveFile({ name, data, mimeType }: { name: string; data: ArrayBuffer; mimeType: string }): Promise<string | null> {
	const files = window.worksuite?.files;
	if (files) {
		const saved = await files.saveExport({ suggestedName: name, data, sideFiles: [] });
		return saved.saved ? (saved.path ?? name) : null;
	}
	const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
	return name;
}
