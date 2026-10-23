"use client";

import { TracksSnapshotCommand } from "@/commands/timeline";
import type { EditorCore } from "@/core";
import type {
	AudioElement,
	SceneTracks,
	TimelineElement,
	VideoElement,
} from "@/timeline";
import { generateUUID } from "@/utils/id";
import { mediaTime } from "@/wasm";
import {
	buildCurvePieces,
	CURVE_BASE_PARAM,
	CURVE_GROUP_PARAM,
	CURVE_POINTS_PARAM,
	CURVE_PRESET_PARAM,
	type CurvePresetId,
	curveGroupOf,
} from "./curves";

type RetimedElement = AudioElement | VideoElement;

const mapTracks = ({
	tracks,
	trackId,
	map,
}: {
	tracks: SceneTracks;
	trackId: string;
	map: (elements: TimelineElement[]) => TimelineElement[];
}): SceneTracks => {
	const apply = <T extends { id: string; elements: TimelineElement[] }>(
		t: T,
	): T => (t.id === trackId ? { ...t, elements: map(t.elements) } : t);
	return {
		overlay: tracks.overlay.map(apply),
		main: apply(tracks.main),
		audio: tracks.audio.map(apply),
	};
};

/** The curve this clip belongs to, if any. */
export function readCurve(element: TimelineElement): {
	group: string;
	preset: CurvePresetId;
	points: number[];
	base: number;
} | null {
	const group = element.params[CURVE_GROUP_PARAM];
	if (typeof group !== "string" || !group) return null;
	let points: number[] = [];
	try {
		const parsed: unknown = JSON.parse(
			String(element.params[CURVE_POINTS_PARAM] ?? "[]"),
		);
		if (Array.isArray(parsed))
			points = parsed.filter((n): n is number => typeof n === "number");
	} catch {}
	const preset = String(element.params[CURVE_PRESET_PARAM] ?? "custom");
	return {
		group,
		preset:
			(
				[
					"montage",
					"hero",
					"bullet",
					"jump-cut",
					"flash-in",
					"flash-out",
					"custom",
				] as const
			).find((p) => p === preset) ?? "custom",
		points,
		base: Number(element.params[CURVE_BASE_PARAM] ?? 1) || 1,
	};
}

/**
 * Collapses a curve group back into one clip at `base` speed and closes or
 * opens the gap after it.
 */
function mergeGroup({
	elements,
	group,
	base,
}: {
	elements: TimelineElement[];
	group: string;
	base: number;
}): { elements: TimelineElement[]; merged: TimelineElement | null } {
	const pieces = curveGroupOf({ elements, group });
	const first = pieces[0];
	const last = pieces.at(-1);
	if (!first || !last) return { elements, merged: null };
	const span = pieces.reduce(
		(n, p) => n + p.duration * ("retime" in p && p.retime ? p.retime.rate : 1),
		0,
	);
	const oldEnd = last.startTime + last.duration;
	const duration = Math.max(1, Math.round(span / base));
	const params = Object.fromEntries(
		Object.entries(first.params).filter(([k]) => !k.startsWith("speedCurve.")),
	);
	const merged: TimelineElement = {
		...first,
		params,
		duration: mediaTime({ ticks: duration }),
		trimEnd: last.trimEnd,
		...("retime" in first
			? {
					retime:
						base === 1
							? undefined
							: {
									rate: base,
									maintainPitch: first.retime?.maintainPitch ?? false,
								},
				}
			: {}),
	};
	const delta = first.startTime + duration - oldEnd;
	const ids = new Set(pieces.map((p) => p.id));
	return {
		merged,
		elements: elements.flatMap((e) => {
			if (e.id === first.id) return [merged];
			if (ids.has(e.id)) return [];
			return e.startTime >= oldEnd
				? [{ ...e, startTime: mediaTime({ ticks: e.startTime + delta }) }]
				: [e];
		}),
	};
}

/** Applies (or with points = null, removes) a speed curve. One undo step. */
export function setSpeedCurve({
	editor,
	trackId,
	element,
	preset,
	points,
}: {
	editor: EditorCore;
	trackId: string;
	element: RetimedElement;
	preset: CurvePresetId | null;
	points: number[] | null;
}): string | null {
	const before = editor.scenes.getActiveScene().tracks;
	const existing = readCurve(element);
	const base = existing?.base ?? element.retime?.rate ?? 1;
	const maintainPitch = element.retime?.maintainPitch ?? false;
	let firstId: string | null = element.id;
	const after = mapTracks({
		tracks: before,
		trackId,
		map: (elements) => {
			let current = elements;
			let target: TimelineElement | undefined = elements.find(
				(e) => e.id === element.id,
			);
			if (existing) {
				const result = mergeGroup({
					elements: current,
					group: existing.group,
					base,
				});
				current = result.elements;
				target = result.merged ?? target;
			}
			if (!points || !preset || !target) {
				firstId = target?.id ?? null;
				return current;
			}
			const rate = "retime" in target && target.retime ? target.retime.rate : 1;
			const sourceSpan = Math.round(target.duration * rate);
			const pieces = buildCurvePieces({
				source: {
					id: target.id,
					startTime: target.startTime,
					trimStart: target.trimStart,
					trimEnd: target.trimEnd,
					sourceSpan,
				},
				points,
				base: rate,
			});
			const group = generateUUID();
			const oldEnd = target.startTime + target.duration;
			const newEnd = pieces.reduce(
				(t: number, p) => Math.max(t, p.startTime + p.duration),
				Number(target.startTime),
			);
			const delta = newEnd - oldEnd;
			const source = target;
			const built: TimelineElement[] = pieces.map((p, i) => ({
				...source,
				id: i === 0 ? source.id : generateUUID(),
				startTime: mediaTime({ ticks: p.startTime }),
				duration: mediaTime({ ticks: p.duration }),
				trimStart: mediaTime({ ticks: p.trimStart }),
				trimEnd: mediaTime({ ticks: p.trimEnd }),
				...(i > 0 ? { animations: undefined, transitionIn: undefined } : {}),
				retime: { rate: p.rate, maintainPitch },
				params: {
					...source.params,
					[CURVE_GROUP_PARAM]: group,
					[CURVE_PRESET_PARAM]: preset,
					[CURVE_POINTS_PARAM]: JSON.stringify(points),
					[CURVE_BASE_PARAM]: rate,
				},
			}));
			firstId = built[0]?.id ?? null;
			return current.flatMap((e) => {
				if (e.id === source.id) return built;
				return e.startTime >= oldEnd
					? [{ ...e, startTime: mediaTime({ ticks: e.startTime + delta }) }]
					: [e];
			});
		},
	});
	editor.command.execute({
		command: new TracksSnapshotCommand({ before, after }),
	});
	return firstId;
}
