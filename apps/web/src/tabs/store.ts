"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CommandHistorySnapshot } from "@/core/managers/commands";
import type { ElementRef } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { closeTab, moveTab, openTab, type ProjectTab } from "./tabs";

interface TabsStore {
	tabs: ProjectTab[];
	activeId: string | null;
	/** Tabs open when the app last closed, offered on the next start (MP-09). */
	lastSession: ProjectTab[];
	closed: ProjectTab[];
	open: (tab: ProjectTab) => void;
	close: (id: string) => string | null;
	move: (args: { from: number; to: number }) => void;
	setActive: (id: string | null) => void;
	reopenClosed: () => ProjectTab | null;
	takeLastSession: () => ProjectTab[];
}

export const useProjectTabs = create<TabsStore>()(
	persist(
		(set, get) => ({
			tabs: [],
			activeId: null,
			lastSession: [],
			closed: [],
			open: (tab) =>
				set((s) => ({
					tabs: openTab({ tabs: s.tabs, tab }),
					activeId: tab.id,
				})),
			close: (id) => {
				const s = get();
				const tab = s.tabs.find((x) => x.id === id);
				const { tabs, nextId } = closeTab({
					tabs: s.tabs,
					id,
					activeId: s.activeId,
				});
				set({
					tabs,
					activeId: nextId,
					closed: tab ? [...s.closed, tab].slice(-20) : s.closed,
				});
				return nextId;
			},
			move: ({ from, to }) =>
				set((s) => ({ tabs: moveTab({ tabs: s.tabs, from, to }) })),
			setActive: (activeId) => set({ activeId }),
			reopenClosed: () => {
				const s = get();
				const tab = s.closed.at(-1) ?? null;
				if (tab) set({ closed: s.closed.slice(0, -1) });
				return tab;
			},
			takeLastSession: () => {
				const tabs = get().lastSession;
				set({ lastSession: [] });
				return tabs;
			},
		}),
		{
			name: "frameflow-project-tabs",
			partialize: ({ tabs, activeId }) => ({ tabs, activeId }),
			// What was open last time becomes the session to restore.
			merge: (persisted, current) => {
				const saved =
					persisted &&
					typeof persisted === "object" &&
					"tabs" in persisted &&
					Array.isArray(persisted.tabs)
						? persisted.tabs.filter(
								(t): t is ProjectTab =>
									!!t &&
									typeof t === "object" &&
									typeof t.id === "string" &&
									typeof t.name === "string",
							)
						: [];
				return { ...current, lastSession: saved };
			},
		},
	),
);

/** Per-tab editor state kept while the app runs (MP-05). */
export interface TabSession {
	history: CommandHistorySnapshot;
	playhead: MediaTime;
	selection: ElementRef[];
}

export const tabSessions = new Map<string, TabSession>();
