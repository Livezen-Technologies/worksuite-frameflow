"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordChoice, type LearnedChoices } from "./candidates";

export type InputMode = "en" | "si" | "ta";
export type SinhalaLayout = "singlish" | "wijesekara";

export const MODE_LABELS: Record<InputMode, string> = {
	en: "EN",
	si: "සිං",
	ta: "த",
};

interface InputMethodStore {
	mode: InputMode;
	sinhalaLayout: SinhalaLayout;
	suggestions: boolean;
	learned: LearnedChoices;
	/** English words that stay English while typing Singlish (TI-06). */
	keepEnglish: string[];
	setMode: (mode: InputMode) => void;
	cycleMode: () => void;
	setSinhalaLayout: (layout: SinhalaLayout) => void;
	setSuggestions: (on: boolean) => void;
	learn: (args: { latin: string; word: string }) => void;
	forget: (args: { latin: string }) => void;
	clearLearned: () => void;
	setKeepEnglish: (words: string[]) => void;
}

const ORDER: InputMode[] = ["en", "si", "ta"];

export const useInputMethod = create<InputMethodStore>()(
	persist(
		(set) => ({
			mode: "en",
			sinhalaLayout: "singlish",
			suggestions: true,
			learned: {},
			keepEnglish: [],
			setMode: (mode) => set({ mode }),
			cycleMode: () =>
				set((s) => ({ mode: ORDER[(ORDER.indexOf(s.mode) + 1) % ORDER.length] })),
			setSinhalaLayout: (sinhalaLayout) => set({ sinhalaLayout }),
			setSuggestions: (suggestions) => set({ suggestions }),
			learn: ({ latin, word }) =>
				set((s) => ({ learned: recordChoice({ learned: s.learned, latin, word }) })),
			forget: ({ latin }) =>
				set((s) => {
					const learned = { ...s.learned };
					delete learned[latin];
					return { learned };
				}),
			clearLearned: () => set({ learned: {} }),
			setKeepEnglish: (keepEnglish) => set({ keepEnglish }),
		}),
		{ name: "frameflow-input-method" },
	),
);
