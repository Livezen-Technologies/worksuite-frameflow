"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Export › Performance: how much memory export may use. */
export type ExportMemoryMode = "low" | "balanced" | "performance";
export type BackgroundRenderMode = "pause" | "continue";

interface ExportPerformanceSettings {
	memory: ExportMemoryMode;
	/** Background "render for smooth playback" while exporting. */
	backgroundRender: BackgroundRenderMode;
	set: (patch: Partial<Pick<ExportPerformanceSettings, "memory" | "backgroundRender">>) => void;
}

export const useExportPerformance = create<ExportPerformanceSettings>()(
	persist(
		(set) => ({
			memory: "balanced",
			backgroundRender: "pause",
			set: (patch) => set(patch),
		}),
		{ name: "frameflow-export-performance", partialize: ({ memory, backgroundRender }) => ({ memory, backgroundRender }) },
	),
);

/** Open video decoders kept at once. Each holds a few full-size frames. */
export function maxOpenDecoders(): number {
	const mode = useExportPerformance.getState().memory;
	return mode === "low" ? 3 : mode === "performance" ? 12 : 6;
}

/** Decoded still images kept at once. */
export function maxCachedImages(): number {
	const mode = useExportPerformance.getState().memory;
	return mode === "low" ? 16 : mode === "performance" ? 96 : 48;
}

/** Device memory in GB when the browser reports it (Chromium rounds it). */
export function deviceMemoryGb(): number | null {
	const value: unknown = Reflect.get(navigator, "deviceMemory");
	return typeof value === "number" ? value : null;
}

/** JS heap in use, in MB, where Chromium exposes it. */
export function heapUsedMb(): number | null {
	const memory: unknown = Reflect.get(performance, "memory");
	if (!memory || typeof memory !== "object") return null;
	const used: unknown = Reflect.get(memory, "usedJSHeapSize");
	return typeof used === "number" ? Math.round(used / 1048576) : null;
}

export interface ExportDiagnostics {
	startedAt: string;
	seconds: number;
	heapStartMb: number | null;
	heapPeakMb: number | null;
	heapEndMb: number | null;
	deviceMemoryGb: number | null;
	memoryMode: ExportMemoryMode;
}

const DIAGNOSTICS_KEY = "frameflow-last-export-diagnostics";

/** Samples memory through an export; the summary is kept for troubleshooting. */
export function startExportDiagnostics(): { finish: () => ExportDiagnostics } {
	const started = performance.now();
	const heapStartMb = heapUsedMb();
	let heapPeakMb = heapStartMb;
	const timer = setInterval(() => {
		const now = heapUsedMb();
		if (now !== null && (heapPeakMb === null || now > heapPeakMb)) heapPeakMb = now;
	}, 1000);
	return {
		finish: () => {
			clearInterval(timer);
			const result: ExportDiagnostics = {
				startedAt: new Date(Date.now() - (performance.now() - started)).toISOString(),
				seconds: Math.round((performance.now() - started) / 100) / 10,
				heapStartMb,
				heapPeakMb,
				heapEndMb: heapUsedMb(),
				deviceMemoryGb: deviceMemoryGb(),
				memoryMode: useExportPerformance.getState().memory,
			};
			try {
				localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(result));
			} catch {
				// Storage unavailable: diagnostics are best effort.
			}
			return result;
		},
	};
}
