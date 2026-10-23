"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { regionPixels, type PrivacyRegion } from "@/privacy/region";

/**
 * Areas hidden from AI (SRS AI-50): blurred out of every frame before it
 * is sent to a cloud model, kept per project. Privacy-region clips on the
 * timeline (ED-15) are part of the rendered frame already.
 */
interface CloudPrivacyState {
	byProject: Record<string, PrivacyRegion[]>;
	set: (args: { projectId: string; regions: PrivacyRegion[] }) => void;
}

export const useCloudPrivacy = create<CloudPrivacyState>()(
	persist(
		(set) => ({
			byProject: {},
			set: ({ projectId, regions }) =>
				set((s) => ({ byProject: { ...s.byProject, [projectId]: regions } })),
		}),
		{ name: "frameflow-cloud-privacy" },
	),
);

/**
 * Hides each area: pixelated to 1/24 of its size, then blurred, so no
 * text survives. Works in place on a 2D canvas.
 */
export function hideAreas({
	canvas,
	regions,
}: {
	canvas: HTMLCanvasElement;
	regions: PrivacyRegion[];
}): void {
	const ctx = canvas.getContext("2d");
	if (!ctx || regions.length === 0) return;
	for (const region of regions) {
		const px = regionPixels({ region, width: canvas.width, height: canvas.height });
		const w = Math.max(1, Math.round(px.width));
		const h = Math.max(1, Math.round(px.height));
		const small = document.createElement("canvas");
		small.width = Math.max(1, Math.round(w / 24));
		small.height = Math.max(1, Math.round(h / 24));
		small.getContext("2d")?.drawImage(canvas, px.left, px.top, w, h, 0, 0, small.width, small.height);
		ctx.save();
		ctx.beginPath();
		if (region.shape === "ellipse")
			ctx.ellipse(px.left + w / 2, px.top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
		else ctx.rect(px.left, px.top, w, h);
		ctx.clip();
		ctx.imageSmoothingEnabled = false;
		ctx.filter = "blur(6px)";
		ctx.drawImage(small, px.left, px.top, w, h);
		ctx.restore();
	}
}
