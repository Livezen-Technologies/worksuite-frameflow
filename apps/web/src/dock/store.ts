"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	DEFAULT_DOCK,
	closePanel,
	dockPanel,
	reopenPanel,
	sanitizeDock,
	showTab,
	type DockLayout,
	type DockPanelId,
	type DockRow,
	type DockZone,
} from "./layout";

interface DockStore {
	layout: DockLayout;
	/** Panel filling the editor (` key); not saved. */
	maximized: DockPanelId | null;
	dock: (args: { id: DockPanelId; target: { row: DockRow; index: number }; zone: DockZone }) => void;
	close: (id: DockPanelId) => void;
	reopen: (id: DockPanelId) => void;
	show: (id: DockPanelId) => void;
	toggleMaximized: (id: DockPanelId) => void;
	reset: () => void;
}

export const useDockStore = create<DockStore>()(
	persist(
		(set) => ({
			layout: DEFAULT_DOCK,
			maximized: null,
			dock: ({ id, target, zone }) =>
				set((s) => ({ layout: dockPanel({ layout: s.layout, id, target, zone }), maximized: null })),
			close: (id) =>
				set((s) => ({
					layout: closePanel({ layout: s.layout, id }),
					maximized: s.maximized === id ? null : s.maximized,
				})),
			reopen: (id) => set((s) => ({ layout: reopenPanel({ layout: s.layout, id }) })),
			show: (id) => set((s) => ({ layout: showTab({ layout: s.layout, id }) })),
			toggleMaximized: (id) => set((s) => ({ maximized: s.maximized === id ? null : id })),
			reset: () => set({ layout: DEFAULT_DOCK, maximized: null }),
		}),
		{
			name: "frameflow-dock",
			partialize: (s) => ({ layout: s.layout }),
			merge: (saved, current) => ({
				...current,
				layout: sanitizeDock(saved && typeof saved === "object" && "layout" in saved ? saved.layout : null),
			}),
		},
	),
);
