"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BrandLogo {
	id: string;
	name: string;
	/** Stored as a data URL so the kit works offline and across projects. */
	dataUrl: string;
}

export type WatermarkCorner =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export interface BrandKit {
	name: string;
	colors: string[];
	headingFont: string;
	bodyFont: string;
	logos: BrandLogo[];
	watermark: { corner: WatermarkCorner; size: number; opacity: number };
}

interface BrandKitStore extends BrandKit {
	setName: (name: string) => void;
	addColor: (color: string) => void;
	removeColor: (color: string) => void;
	setFonts: (
		fonts: Partial<Pick<BrandKit, "headingFont" | "bodyFont">>,
	) => void;
	addLogo: (logo: BrandLogo) => void;
	removeLogo: (id: string) => void;
	setWatermark: (watermark: Partial<BrandKit["watermark"]>) => void;
}

export const MAX_LOGOS = 6;
export const MAX_LOGO_BYTES = 1_000_000;

/** One brand kit per device (SRS CL-05 team libraries can sync it later). */
export const useBrandKit = create<BrandKitStore>()(
	persist(
		(set) => ({
			name: "My brand",
			colors: ["#4C8DFF", "#0F172A", "#FFFFFF", "#F59E0B"],
			headingFont: "Inter",
			bodyFont: "Inter",
			logos: [],
			watermark: { corner: "bottom-right", size: 12, opacity: 85 },
			setName: (name) => set({ name }),
			addColor: (color) =>
				set((s) => ({
					colors: s.colors.includes(color)
						? s.colors
						: [...s.colors, color].slice(0, 12),
				})),
			removeColor: (color) =>
				set((s) => ({ colors: s.colors.filter((c) => c !== color) })),
			setFonts: (fonts) => set(fonts),
			addLogo: (logo) =>
				set((s) => ({ logos: [...s.logos, logo].slice(-MAX_LOGOS) })),
			removeLogo: (id) =>
				set((s) => ({ logos: s.logos.filter((l) => l.id !== id) })),
			setWatermark: (watermark) =>
				set((s) => ({ watermark: { ...s.watermark, ...watermark } })),
		}),
		{ name: "frameflow-brand-kit" },
	),
);
