"use client";

import { useEffect, useState } from "react";
import type { EditorCore } from "@/core";

/**
 * Export time estimate (SRS EX-22): times a few real frames of this
 * project, then scales by the number of output frames and their size.
 */
export function useRenderSpeed({
	editor,
}: {
	editor: EditorCore;
}): number | null {
	const [msPerFrame, setMs] = useState<number | null>(null);
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const duration = editor.timeline.getTotalDuration();
				const times = [0.25, 0.5, 0.75].map((f) => Math.round(duration * f));
				// The first draw warms up decoders and the GPU; don't count it.
				await editor.project.renderFrame({ time: times[0] ?? 0 });
				const start = performance.now();
				for (const time of times) await editor.project.renderFrame({ time });
				if (!cancelled) setMs((performance.now() - start) / times.length);
			} catch {
				// No estimate; the dialog shows none.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [editor]);
	return msPerFrame;
}

export function estimateExportSeconds({
	msPerFrame,
	frames,
	pixelRatio,
	extraMsPerFrame = 0,
}: {
	msPerFrame: number;
	frames: number;
	/** Output pixels ÷ project pixels: encoding and scaling cost. */
	pixelRatio: number;
	extraMsPerFrame?: number;
}): number {
	// Encoding roughly doubles a frame's cost, more for bigger outputs.
	const perFrame = msPerFrame * (1.6 + 0.6 * Math.max(0, pixelRatio - 1)) + extraMsPerFrame;
	return (perFrame * frames) / 1000;
}

export function formatEstimate(seconds: number): string {
	if (seconds < 60) return "under a minute";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `about ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return `about ${hours} h ${minutes % 60} min`;
}
