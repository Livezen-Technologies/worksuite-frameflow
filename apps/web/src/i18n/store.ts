"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { detectLocale, type LocaleCode } from "./locales";

interface LocaleStore {
	locale: LocaleCode;
	setLocale: (locale: LocaleCode) => void;
}

export const useLocale = create<LocaleStore>()(
	persist(
		(set) => ({
			locale:
				typeof navigator === "undefined"
					? "en"
					: detectLocale(navigator.languages ?? [navigator.language]),
			setLocale: (locale) => set({ locale }),
		}),
		{ name: "frameflow-locale" },
	),
);
