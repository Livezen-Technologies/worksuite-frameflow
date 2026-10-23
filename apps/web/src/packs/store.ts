"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PackFields } from "./compile";
import type { PackId, PackLanguage } from "./types";

interface PackStore {
	pack: PackId;
	language: PackLanguage;
	useBrand: boolean;
	fields: PackFields;
	favourites: string[];
	setPack: (pack: PackId) => void;
	setLanguage: (language: PackLanguage) => void;
	setUseBrand: (on: boolean) => void;
	setField: (args: { key: string; value: string }) => void;
	toggleFavourite: (id: string) => void;
}

/** The Packs panel's choices and the user's placeholder details (SP-06, SP-09). */
export const usePackStore = create<PackStore>()(
	persist(
		(set) => ({
			pack: "youtube",
			language: "en",
			useBrand: false,
			fields: {},
			favourites: [],
			setPack: (pack) => set({ pack }),
			setLanguage: (language) => set({ language }),
			setUseBrand: (useBrand) => set({ useBrand }),
			setField: ({ key, value }) =>
				set((s) => ({ fields: { ...s.fields, [key]: value } })),
			toggleFavourite: (id) =>
				set((s) => ({
					favourites: s.favourites.includes(id)
						? s.favourites.filter((f) => f !== id)
						: [...s.favourites, id],
				})),
		}),
		{ name: "frameflow-template-packs" },
	),
);
