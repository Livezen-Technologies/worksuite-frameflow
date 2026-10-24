import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pushRecent } from "./recent";

/** Favourites, recently used and the preview text of the Text library (per device). */
interface TextLibraryState {
	favourites: string[];
	recent: string[];
	previewText: string;
	toggleFavourite: (key: string) => void;
	markUsed: (key: string) => void;
	setPreviewText: (text: string) => void;
}


export const useTextLibraryStore = create<TextLibraryState>()(
	persist(
		(set) => ({
			favourites: [],
			recent: [],
			previewText: "",
			toggleFavourite: (key) =>
				set((s) => ({ favourites: s.favourites.includes(key) ? s.favourites.filter((k) => k !== key) : [...s.favourites, key] })),
			markUsed: (key) => set((s) => ({ recent: pushRecent(s.recent, key) })),
			setPreviewText: (previewText) => set({ previewText }),
		}),
		{ name: "frameflow-text-library" },
	),
);
