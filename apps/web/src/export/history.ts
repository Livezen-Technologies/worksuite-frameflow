"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** One finished export, for the Exports page. Kept on this device. */
export interface ExportRecord {
	id: string;
	projectId: string;
	projectName: string;
	fileName: string;
	/** Where the desktop app saved it (web downloads have no path). */
	path?: string;
	/** "mp4", "png", … */
	format: string;
	bytes: number;
	width?: number;
	height?: number;
	at: number;
}

export const useExportHistory = create<{
	entries: ExportRecord[];
	add: (entry: Omit<ExportRecord, "id" | "at">) => void;
	remove: (id: string) => void;
	clear: () => void;
}>()(
	persist(
		(set) => ({
			entries: [],
			add: (entry) =>
				set((s) => ({ entries: [{ ...entry, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() }, ...s.entries].slice(0, 300) })),
			remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
			clear: () => set({ entries: [] }),
		}),
		{ name: "frameflow-export-history" },
	),
);

export function recordExport(entry: Omit<ExportRecord, "id" | "at">) {
	useExportHistory.getState().add(entry);
}
