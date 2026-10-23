"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ModelPrices } from "./cost";

/**
 * Spending cap for AI jobs (SRS AI-47): what this month's jobs cost, from
 * the token counts the provider reports, and the most the user allows.
 */
export interface SpendEntry {
	at: number;
	kind: string;
	usd: number;
	cached: boolean;
}

interface SpendState {
	/** USD per calendar month; 0 means no cap. */
	capUsd: number;
	month: string;
	spentUsd: number;
	recent: SpendEntry[];
	/** User price overrides per model (USD per 1M tokens). */
	prices: Record<string, ModelPrices>;
	setCap: (usd: number) => void;
	setPrices: (args: { model: string; prices: ModelPrices }) => void;
	record: (entry: Omit<SpendEntry, "at">) => void;
	resetMonth: () => void;
}

export const monthKey = (date = new Date()) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const useAiSpend = create<SpendState>()(
	persist(
		(set) => ({
			capUsd: 5,
			month: monthKey(),
			spentUsd: 0,
			recent: [],
			prices: {},
			setCap: (usd) => set({ capUsd: Math.max(0, Number.isFinite(usd) ? usd : 0) }),
			setPrices: ({ model, prices }) =>
				set((s) => ({ prices: { ...s.prices, [model]: prices } })),
			record: (entry) =>
				set((s) => {
					const month = monthKey();
					const spent = (s.month === month ? s.spentUsd : 0) + entry.usd;
					return {
						month,
						spentUsd: spent,
						recent: [{ ...entry, at: Date.now() }, ...s.recent].slice(0, 50),
					};
				}),
			resetMonth: () => set({ month: monthKey(), spentUsd: 0 }),
		}),
		{ name: "frameflow-ai-spend" },
	),
);

/** This month's spend (a new month starts at zero). */
export function spentThisMonth(): number {
	const s = useAiSpend.getState();
	return s.month === monthKey() ? s.spentUsd : 0;
}

/** Whether a job costing `usd` fits under the cap. */
export function fitsCap({ usd }: { usd: number }): {
	ok: boolean;
	remaining: number | null;
} {
	const { capUsd } = useAiSpend.getState();
	if (capUsd <= 0) return { ok: true, remaining: null };
	const remaining = Math.max(0, capUsd - spentThisMonth());
	return { ok: usd <= remaining, remaining };
}
