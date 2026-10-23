import type { EditorCore } from "@/core";
import { decodeAudioToFloat32 } from "@/media/audio";
import type { MediaAsset } from "@/media/types";
import type { VideoElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import { TICKS_PER_SECOND } from "@/wasm";
import { ApplyMulticamCommand } from "./command";
import { buildSpans, switchSpan, type CutSpan } from "./cuts";
import { loudnessEnvelope, suggestCuts } from "./smart";
import { offsetsFromEnvelopes, onsetEnvelope } from "./sync";
import {
	MAX_ANGLES,
	MIN_ANGLES,
	type MulticamCut,
	type MulticamGroup,
	type MulticamTag,
} from "./types";

const ANALYSIS_RATE = 8000;

export type SyncMethod = "audio" | "start" | "manual";

/** Per-angle audio analysis, kept for smart switching. */
const loudnessCache = new Map<string, Float32Array>();

async function analyse(
	asset: MediaAsset,
): Promise<{ onset: Float32Array; loudness: Float32Array } | null> {
	try {
		const { samples } = await decodeAudioToFloat32({
			audioBlob: asset.file,
			sampleRate: ANALYSIS_RATE,
		});
		const loudness = loudnessEnvelope({ samples, sampleRate: ANALYSIS_RATE });
		loudnessCache.set(asset.id, loudness);
		return {
			onset: onsetEnvelope({ samples, sampleRate: ANALYSIS_RATE }),
			loudness,
		};
	} catch {
		return null; // no audio track
	}
}

/** Create a multicam clip at the playhead (SC-24, SC-25). */
export async function createMulticam({
	editor,
	assets,
	name,
	sync,
	onProgress,
}: {
	editor: EditorCore;
	assets: MediaAsset[];
	name: string;
	sync: SyncMethod;
	onProgress?: (step: string) => void;
}): Promise<{ group: MulticamGroup; confidence: number[] }> {
	if (assets.length < MIN_ANGLES || assets.length > MAX_ANGLES)
		throw new Error(
			`A multicam clip needs ${MIN_ANGLES} to ${MAX_ANGLES} video clips.`,
		);
	let offsets = assets.map(() => 0);
	let confidence = assets.map(() => 1);
	if (sync === "audio") {
		const envelopes: Float32Array[] = [];
		for (const [i, asset] of assets.entries()) {
			onProgress?.(`Listening to ${asset.name} (${i + 1}/${assets.length})`);
			const result = await analyse(asset);
			if (!result)
				throw new Error(
					`${asset.name} has no sound to sync by. Try "Recording start time" or "Line up by hand".`,
				);
			envelopes.push(result.onset);
		}
		onProgress?.("Lining up the angles");
		({ offsets, confidence } = offsetsFromEnvelopes({ envelopes }));
	} else if (sync === "start") {
		// File times mark when recording ended; start = end − length.
		const starts = assets.map(
			(a) => a.file.lastModified / 1000 - (a.duration ?? 0),
		);
		const first = Math.min(...starts);
		offsets = starts.map((s) => s - first);
	}
	const angles = assets.map((asset, i) => ({
		mediaId: asset.id,
		name: `Cam ${i + 1}`,
		offset: offsets[i],
		duration: asset.duration ?? 0,
	}));
	const group: MulticamGroup = {
		id: generateUUID(),
		name,
		angles,
		audio: "follow",
		length: Math.max(...angles.map((a) => a.offset + a.duration)),
		sync,
	};
	const start = editor.playback.getCurrentTime() / TICKS_PER_SECOND;
	apply({ editor, group, cuts: [{ at: 0, angle: 0 }], start });
	return { group, confidence };
}

function apply({
	editor,
	group,
	cuts,
	start,
}: {
	editor: EditorCore;
	group: MulticamGroup;
	cuts: MulticamCut[];
	start: number;
}) {
	editor.command.execute({
		command: new ApplyMulticamCommand({
			group,
			spans: buildSpans({ group, cuts }),
			start,
		}),
	});
}

/** The group's current cut clips, in order, with their spans in group time. */
export function readGroup({
	editor,
	groupId,
}: {
	editor: EditorCore;
	groupId: string;
}): {
	tag: MulticamTag;
	spans: CutSpan[];
} | null {
	const { tracks } = editor.scenes.getActiveScene();
	const clips: VideoElement[] = [];
	for (const track of [...tracks.overlay, tracks.main])
		for (const e of track.elements)
			if (
				e.type === "video" &&
				e.multicam?.groupId === groupId &&
				e.multicam.role !== "audio"
			)
				clips.push(e);
	if (!clips.length) return null;
	clips.sort((a, b) => a.startTime - b.startTime);
	const tag = clips[0].multicam;
	if (!tag) return null;
	const spans = clips.map((c) => ({
		start: c.startTime / TICKS_PER_SECOND - tag.start,
		end: (c.startTime + c.duration) / TICKS_PER_SECOND - tag.start,
		angle: c.multicam?.angle ?? 0,
	}));
	return { tag, spans };
}

const cutsOf = (spans: CutSpan[]): MulticamCut[] =>
	spans.map((s) => ({ at: s.start, angle: s.angle }));

/**
 * Live switching (SC-26): pressing an angle while playing records a cut
 * there, and everything played through since the last press is replaced,
 * as on a vision mixer. `finishLive` closes the pass when playback stops.
 */
const livePass = new Map<string, number>();

function overwrite({
	cuts,
	from,
	to,
}: {
	cuts: MulticamCut[];
	from: number;
	to: number;
}) {
	return cuts.filter((c) => c.at <= from + 1e-3 || c.at >= to - 1e-3);
}

export function liveCut({
	editor,
	groupId,
	angle,
}: {
	editor: EditorCore;
	groupId: string;
	angle: number;
}) {
	const current = readGroup({ editor, groupId });
	if (!current) return;
	const at =
		editor.playback.getCurrentTime() / TICKS_PER_SECOND - current.tag.start;
	if (at < 0 || at >= current.tag.group.length) return;
	const from = livePass.get(groupId);
	let cuts = cutsOf(current.spans);
	if (from !== undefined && from < at) cuts = overwrite({ cuts, from, to: at });
	cuts = [...cuts.filter((c) => Math.abs(c.at - at) > 1e-3), { at, angle }];
	livePass.set(groupId, at);
	apply({ editor, group: current.tag.group, cuts, start: current.tag.start });
}

export function finishLive({
	editor,
	groupId,
}: {
	editor: EditorCore;
	groupId: string;
}) {
	const from = livePass.get(groupId);
	livePass.delete(groupId);
	if (from === undefined) return;
	const current = readGroup({ editor, groupId });
	if (!current) return;
	const to =
		editor.playback.getCurrentTime() / TICKS_PER_SECOND - current.tag.start;
	const cuts = cutsOf(current.spans);
	const kept = overwrite({ cuts, from, to });
	if (kept.length !== cuts.length)
		apply({
			editor,
			group: current.tag.group,
			cuts: kept,
			start: current.tag.start,
		});
}

/** Change the angle of the cut under the playhead (SC-27). */
export function switchAngle({
	editor,
	groupId,
	angle,
}: {
	editor: EditorCore;
	groupId: string;
	angle: number;
}) {
	const current = readGroup({ editor, groupId });
	if (!current) return;
	const at =
		editor.playback.getCurrentTime() / TICKS_PER_SECOND - current.tag.start;
	apply({
		editor,
		group: current.tag.group,
		cuts: switchSpan({ spans: current.spans, at, angle }),
		start: current.tag.start,
	});
}

/** Audio from one angle, or following the picture (SC-27). */
export function setAudio({
	editor,
	groupId,
	audio,
}: {
	editor: EditorCore;
	groupId: string;
	audio: "follow" | number;
}) {
	const current = readGroup({ editor, groupId });
	if (!current) return;
	apply({
		editor,
		group: { ...current.tag.group, audio },
		cuts: cutsOf(current.spans),
		start: current.tag.start,
	});
}

/** Give every cut of an angle the grade of one clip (SC-28). */
export function applyGradeToAngle({
	editor,
	element,
}: {
	editor: EditorCore;
	element: VideoElement;
}) {
	const tag = element.multicam;
	if (!tag) return [];
	const { tracks } = editor.scenes.getActiveScene();
	const updates = [];
	for (const track of [...tracks.overlay, tracks.main])
		for (const e of track.elements)
			if (
				e.type === "video" &&
				e.multicam?.groupId === tag.groupId &&
				e.multicam.angle === tag.angle &&
				e.id !== element.id
			)
				updates.push({
					trackId: track.id,
					elementId: e.id,
					patch: { effects: element.effects ?? [] },
				});
	return updates;
}

/** Suggest cuts to whoever is speaking (SC-29). */
export async function smartSwitch({
	editor,
	groupId,
	assets,
}: {
	editor: EditorCore;
	groupId: string;
	assets: MediaAsset[];
}) {
	const current = readGroup({ editor, groupId });
	if (!current) return 0;
	const group = current.tag.group;
	const loudness: Float32Array[] = [];
	for (const angle of group.angles) {
		let env = loudnessCache.get(angle.mediaId);
		if (!env) {
			const asset = assets.find((a) => a.id === angle.mediaId);
			if (asset) await analyse(asset);
			env = loudnessCache.get(angle.mediaId);
		}
		loudness.push(env ?? new Float32Array());
	}
	const cuts = suggestCuts({ group, loudness, rate: 20 });
	apply({ editor, group, cuts, start: current.tag.start });
	return cuts.length;
}

/** Nudge one angle's sync by hand (SC-25 manual). */
export function setOffset({
	editor,
	groupId,
	angle,
	offset,
}: {
	editor: EditorCore;
	groupId: string;
	angle: number;
	offset: number;
}) {
	const current = readGroup({ editor, groupId });
	if (!current) return;
	const angles = current.tag.group.angles.map((a, i) =>
		i === angle ? { ...a, offset: Math.max(0, offset) } : a,
	);
	const group = {
		...current.tag.group,
		angles,
		sync: "manual" as const,
		length: Math.max(...angles.map((a) => a.offset + a.duration)),
	};
	apply({
		editor,
		group,
		cuts: cutsOf(current.spans),
		start: current.tag.start,
	});
}
