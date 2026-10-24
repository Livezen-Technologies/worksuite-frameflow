"use client";

import { create } from "zustand";
import type { Layer, MotionProject } from "./model";

const HISTORY_LIMIT = 200;

interface StudioState {
	project: MotionProject | null;
	past: MotionProject[];
	future: MotionProject[];
	selection: string[];
	time: number;
	playing: boolean;
	/** Path layer whose points are being edited. */
	editingPath: string | null;
	load: (project: MotionProject) => void;
	/** A change that can be undone. */
	commit: (update: (project: MotionProject) => MotionProject) => void;
	/** Starts a drag: one undo step for the whole gesture. */
	checkpoint: () => void;
	/** A change during a drag (no new undo step). */
	preview: (update: (project: MotionProject) => MotionProject) => void;
	updateLayer: (args: { id: string; update: (layer: Layer) => Layer; preview?: boolean }) => void;
	undo: () => void;
	redo: () => void;
	select: (ids: string[]) => void;
	setTime: (time: number) => void;
	setPlaying: (playing: boolean) => void;
	setEditingPath: (id: string | null) => void;
}

const touch = (project: MotionProject): MotionProject => ({ ...project, updatedAt: Date.now() });

export const useStudio = create<StudioState>()((set, get) => ({
	project: null,
	past: [],
	future: [],
	selection: [],
	time: 0,
	playing: false,
	editingPath: null,
	load: (project) => set({ project, past: [], future: [], selection: [], time: 0, playing: false, editingPath: null }),
	commit: (update) => {
		const { project, past } = get();
		if (!project) return;
		set({ project: touch(update(project)), past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
	},
	checkpoint: () => {
		const { project, past } = get();
		if (project) set({ past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
	},
	preview: (update) => {
		const { project } = get();
		if (project) set({ project: touch(update(project)) });
	},
	updateLayer: ({ id, update, preview }) => {
		const apply = (p: MotionProject) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? update(l) : l)) });
		if (preview) get().preview(apply);
		else get().commit(apply);
	},
	undo: () => {
		const { project, past, future } = get();
		const previous = past[past.length - 1];
		if (!project || !previous) return;
		set({ project: previous, past: past.slice(0, -1), future: [project, ...future] });
	},
	redo: () => {
		const { project, past, future } = get();
		const next = future[0];
		if (!project || !next) return;
		set({ project: next, past: [...past, project], future: future.slice(1) });
	},
	select: (selection) => set({ selection }),
	setTime: (time) => {
		const duration = get().project?.duration ?? 0;
		set({ time: Math.max(0, Math.min(duration, time)) });
	},
	setPlaying: (playing) => set({ playing }),
	setEditingPath: (editingPath) => set({ editingPath }),
}));
