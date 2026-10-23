"use client";

import { create } from "zustand";
import { SetTimelineGradeCommand } from "@/commands/scene/set-timeline-grade";
import { buildDefaultEffectInstance } from "@/effects";
import type { Effect } from "@/effects/types";
import { useEditor } from "@/editor/use-editor";
import type { ParamValues } from "@/params";
import type { VisualElement } from "@/timeline";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";

/**
 * What a grade is applied to (WS-12): one clip, or the whole timeline on top
 * of every clip. The colour controls work the same way on either.
 */
export interface GradeTarget {
	kind: "clip" | "timeline";
	key: string;
	name: string;
	/** Timeline ticks where the target starts, for keyframes. */
	startTime: number;
	/** Preview-aware nodes, in order. */
	effects: Effect[];
	preview: (effects: Effect[]) => void;
	commitPreview: () => void;
	discardPreview: () => void;
	setParams: (args: { effectId: string; params: ParamValues }) => void;
	add: (effectType: string) => string;
	remove: (effectId: string) => void;
	toggle: (effectId: string) => void;
	move: (args: { fromIndex: number; toIndex: number }) => void;
}

/** Timeline-grade changes while a control is dragged; null when nothing is in flight. */
export const useTimelineGradePreview = create<{
	effects: Effect[] | null;
	set: (effects: Effect[] | null) => void;
}>((set) => ({ effects: null, set: (effects) => set({ effects }) }));

export function useClipGradeTarget({ trackId, element }: { trackId: string; element: VisualElement }): GradeTarget {
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } = useElementPreview({ trackId, elementId: element.id, fallback: element });
	const effects = (renderElement as VisualElement).effects ?? element.effects ?? [];
	const ref = { trackId, elementId: element.id };
	return {
		kind: "clip",
		key: `${trackId}:${element.id}`,
		name: element.name,
		startTime: element.startTime,
		effects,
		preview: (next) => previewUpdates({ effects: next }),
		commitPreview: commit,
		discardPreview: () => editor.timeline.discardPreview(),
		setParams: ({ effectId, params }) => editor.timeline.updateClipEffectParams({ ...ref, effectId, params }),
		add: (effectType) => editor.timeline.addClipEffect({ ...ref, effectType }),
		remove: (effectId) => editor.timeline.removeClipEffect({ ...ref, effectId }),
		toggle: (effectId) => editor.timeline.toggleClipEffect({ ...ref, effectId }),
		move: ({ fromIndex, toIndex }) => editor.timeline.reorderClipEffects({ ...ref, fromIndex, toIndex }),
	};
}

export function useTimelineGradeTarget(): GradeTarget {
	const editor = useEditor();
	const grade = useEditor((e) => e.scenes.getActiveSceneOrNull()?.grade);
	const pending = useTimelineGradePreview((s) => s.effects);
	const setPending = useTimelineGradePreview((s) => s.set);
	const saved = grade?.effects ?? EMPTY;
	const effects = pending ?? saved;
	const save = (next: Effect[]) => {
		setPending(null);
		editor.command.execute({
			command: new SetTimelineGradeCommand(next.length ? { enabled: grade?.enabled ?? true, effects: next } : undefined),
		});
	};
	return {
		kind: "timeline",
		key: "timeline",
		name: "Whole timeline",
		startTime: 0,
		effects,
		preview: setPending,
		commitPreview: () => {
			const next = useTimelineGradePreview.getState().effects;
			if (next) save(next);
		},
		discardPreview: () => setPending(null),
		setParams: ({ effectId, params }) =>
			save(effects.map((e) => (e.id === effectId ? { ...e, params: { ...e.params, ...params } } : e))),
		add: (effectType) => {
			const instance = buildDefaultEffectInstance({ effectType });
			save([...effects, instance]);
			return instance.id;
		},
		remove: (effectId) => save(effects.filter((e) => e.id !== effectId)),
		toggle: (effectId) => save(effects.map((e) => (e.id === effectId ? { ...e, enabled: !e.enabled } : e))),
		move: ({ fromIndex, toIndex }) => {
			const next = [...effects];
			const [moved] = next.splice(fromIndex, 1);
			if (moved) next.splice(toIndex, 0, moved);
			save(next);
		},
	};
}

const EMPTY: Effect[] = [];

/** The saved grade, for export and thumbnails. */
export const savedTimelineGrade = (grade: { enabled: boolean; effects: Effect[] } | undefined): Effect[] =>
	grade?.enabled ? grade.effects : EMPTY;
