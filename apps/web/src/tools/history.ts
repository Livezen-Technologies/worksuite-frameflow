"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** One finished conversion or quick-tool result (CV-08 history). */
export interface ConversionRecord {
	id: string;
	name: string;
	output: string;
	to: string;
	sourceBytes: number;
	bytes: number;
	at: number;
}

export const useConversionHistory = create<{
	records: ConversionRecord[];
	add: (record: ConversionRecord) => void;
	clear: () => void;
}>()(
	persist(
		(set) => ({
			records: [],
			add: (record) => set((s) => ({ records: [record, ...s.records].slice(0, 300) })),
			clear: () => set({ records: [] }),
		}),
		{ name: "frameflow-conversion-history" },
	),
);
