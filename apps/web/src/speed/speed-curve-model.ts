"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EditorCore } from "@/core";
import { averageCurveSpeed, clampRetimeRate, normalizeCurve, type SpeedKeyframe } from "@/retime";
import type { AudioElement, RetimeConfig, VideoElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { roundMediaTime } from "@/wasm";

export type CurveClip = AudioElement | VideoElement;

export interface SpeedCurvePreset {
	id: string;
	label: string;
	keyframes: Omit<SpeedKeyframe, "id">[];
}

/** Evenly spaced smooth keyframes from a list of speeds. */
const even = (speeds: number[]): Omit<SpeedKeyframe, "id">[] =>
	speeds.map((speed, i) => ({ at: speeds.length === 1 ? 0 : i / (speeds.length - 1), speed, interpolation: "smooth" }));

export const BUILT_IN_CURVES: SpeedCurvePreset[] = [
	{ id: "montage", label: "Montage", keyframes: even([1, 2.5, 1, 0.35, 1]) },
	{ id: "hero", label: "Hero", keyframes: even([1.8, 1.8, 0.25, 1.8, 0.25, 1.8, 1.8]) },
	{ id: "bullet", label: "Bullet", keyframes: even([1.8, 1.8, 0.15, 1.8, 1.8]) },
	{ id: "jump-cut", label: "Jump Cut", keyframes: even([0.6, 0.6, 3, 0.6, 0.6]) },
	{ id: "flash-in", label: "Flash In", keyframes: even([3, 3, 1.2, 0.7, 0.7]) },
	{ id: "flash-out", label: "Flash Out", keyframes: even([0.7, 0.7, 1.2, 3, 3]) },
	{ id: "accelerate", label: "Smooth Accel", keyframes: even([0.5, 3]) },
	{ id: "decelerate", label: "Smooth Decel", keyframes: even([3, 0.5]) },
	{ id: "slow-fast-slow", label: "Slow–Fast–Slow", keyframes: even([0.4, 3, 0.4]) },
	{ id: "fast-slow-fast", label: "Fast–Slow–Fast", keyframes: even([3, 0.3, 3]) },
	{
		id: "cinematic",
		label: "Cinematic",
		keyframes: [
			{ at: 0, speed: 1, interpolation: "smooth" },
			{ at: 0.35, speed: 1, interpolation: "smooth" },
			{ at: 0.45, speed: 0.2, interpolation: "hold" },
			{ at: 0.65, speed: 0.2, interpolation: "smooth" },
			{ at: 0.75, speed: 2, interpolation: "smooth" },
			{ at: 1, speed: 1, interpolation: "smooth" },
		],
	},
];

export const FLAT_CURVE: Omit<SpeedKeyframe, "id">[] = even([1, 1]);

export function withIds(keyframes: Omit<SpeedKeyframe, "id">[]): SpeedKeyframe[] {
	return normalizeCurve(keyframes.map((k) => ({ ...k, id: generateUUID() })));
}

interface CurveLibrary {
	/** The user's own presets. */
	saved: SpeedCurvePreset[];
	/** Copied curve, for pasting onto another clip. */
	clipboard: SpeedKeyframe[] | null;
	save: (preset: { label: string; keyframes: SpeedKeyframe[] }) => void;
	remove: (id: string) => void;
	copy: (keyframes: SpeedKeyframe[]) => void;
}

export const useCurveLibrary = create<CurveLibrary>()(
	persist(
		(set) => ({
			saved: [],
			clipboard: null,
			save: ({ label, keyframes }) =>
				set((s) => ({
					saved: [
						...s.saved,
						{ id: `user-${generateUUID()}`, label, keyframes: keyframes.map(({ id: _id, ...k }) => k) },
					],
				})),
			remove: (id) => set((s) => ({ saved: s.saved.filter((p) => p.id !== id) })),
			copy: (keyframes) => set({ clipboard: keyframes }),
		}),
		{ name: "frameflow-speed-curves", partialize: (s) => ({ saved: s.saved }) },
	),
);

/** The retime for a curve (or plain speed when `keyframes` is null). One undo step. */
export function retimeWithCurve({
	element,
	keyframes,
	preset,
}: {
	element: CurveClip;
	keyframes: SpeedKeyframe[] | null;
	preset?: string;
}): RetimeConfig | undefined {
	const maintainPitch = element.retime?.maintainPitch ?? false;
	const reverse = element.retime?.reverse || undefined;
	if (!keyframes) {
		return maintainPitch || reverse ? { rate: 1, maintainPitch, ...(reverse ? { reverse } : {}) } : undefined;
	}
	const curve = normalizeCurve(keyframes);
	return {
		rate: clampRetimeRate({ rate: averageCurveSpeed(curve) }),
		maintainPitch,
		curve,
		...(preset ? { curvePreset: preset } : {}),
		...(reverse ? { reverse } : {}),
	};
}

export function applyCurve({
	editor,
	trackId,
	element,
	keyframes,
	preset,
	pushHistory = true,
}: {
	editor: EditorCore;
	trackId: string;
	element: CurveClip;
	keyframes: SpeedKeyframe[] | null;
	preset?: string;
	pushHistory?: boolean;
}) {
	editor.timeline.updateElementRetime({
		trackId,
		elementId: element.id,
		retime: retimeWithCurve({ element, keyframes, preset }),
		pushHistory,
	});
}

/** Live preview while dragging (no undo step until commit). */
export function previewCurve({
	editor,
	trackId,
	element,
	keyframes,
}: {
	editor: EditorCore;
	trackId: string;
	element: CurveClip;
	keyframes: SpeedKeyframe[];
}) {
	const retime = retimeWithCurve({ element, keyframes, preset: "custom" });
	// The source span stays; the duration follows the new average speed.
	const span = element.duration * (element.retime?.rate ?? 1);
	const duration = roundMediaTime({ time: span / (retime?.rate ?? 1) });
	editor.timeline.previewElements({
		updates: [{ trackId, elementId: element.id, updates: { retime, duration } }],
	});
}
