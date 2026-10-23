"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { recordChoice, type LearnedChoices } from "./candidates";

export type InputMode = "en" | "si" | "ta";
export type SinhalaLayout = "singlish" | "wijesekara";
export type TamilLayout = "phonetic" | "tamil99";

export const MODE_LABELS: Record<InputMode, string> = {
	en: "EN",
	si: "සිං",
	ta: "த",
};

interface InputMethodStore {
	mode: InputMode;
	sinhalaLayout: SinhalaLayout;
	tamilLayout: TamilLayout;
	suggestions: boolean;
	learned: LearnedChoices;
	/** Word → words typed after it, with counts (TI-12). */
	nextWords: Record<string, Record<string, number>>;
	/** English words that stay English while typing Singlish (TI-06). */
	keepEnglish: string[];
	/** Words added to the dictionary from spell check (TI-13). */
	customWords: string[];
	addCustomWord: (word: string) => void;
	setMode: (mode: InputMode) => void;
	cycleMode: () => void;
	setSinhalaLayout: (layout: SinhalaLayout) => void;
	setTamilLayout: (layout: TamilLayout) => void;
	setSuggestions: (on: boolean) => void;
	learn: (args: { latin: string; word: string }) => void;
	learnNext: (args: { previous: string; word: string }) => void;
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
			tamilLayout: "phonetic",
			suggestions: true,
			learned: {},
			nextWords: {},
			keepEnglish: [],
			customWords: [],
			addCustomWord: (word) =>
				set((s) => ({ customWords: s.customWords.includes(word) ? s.customWords : [...s.customWords, word] })),
			setMode: (mode) => set({ mode }),
			cycleMode: () =>
				set((s) => ({ mode: ORDER[(ORDER.indexOf(s.mode) + 1) % ORDER.length] })),
			setSinhalaLayout: (sinhalaLayout) => set({ sinhalaLayout }),
			setTamilLayout: (tamilLayout) => set({ tamilLayout }),
			setSuggestions: (suggestions) => set({ suggestions }),
			learn: ({ latin, word }) =>
				set((s) => ({ learned: recordChoice({ learned: s.learned, latin, word }) })),
			learnNext: ({ previous, word }) =>
				set((s) => {
					const after = { ...(s.nextWords[previous] ?? {}) };
					after[word] = (after[word] ?? 0) + 1;
					return { nextWords: { ...s.nextWords, [previous]: after } };
				}),
			forget: ({ latin }) =>
				set((s) => {
					const learned = { ...s.learned };
					delete learned[latin];
					return { learned };
				}),
			clearLearned: () => set({ learned: {}, nextWords: {} }),
			setKeepEnglish: (keepEnglish) => set({ keepEnglish }),
		}),
		{ name: "frameflow-input-method" },
	),
);
