"use client";

import { useEditor } from "@/editor/use-editor";

/** Shown while the project has HDR footage: the preview is SDR (HD-09). */
export function ToneMappedLabel() {
	const hasHdr = useEditor((e) =>
		e.media.getAssets().some((a) => a.color && a.color.transfer !== "sdr"),
	);
	const mode = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.colorSpace,
	);
	const hdrProject = mode === "hlg" || mode === "pq";
	if (!hasHdr && !hdrProject) return null;
	return (
		<span
			className="rounded border border-amber-400/50 px-1.5 py-0.5 text-[10px] text-amber-300"
			title={
				hdrProject
					? "HDR project: the preview is tone-mapped for this SDR display; exports keep full HDR."
					: "HDR clips are tone-mapped to SDR in this project."
			}
			data-tone-mapped-label
		>
			{hdrProject
				? `${mode === "pq" ? "HDR10" : "HLG"} project · previewing tone-mapped`
				: "Previewing tone-mapped"}
		</span>
	);
}
