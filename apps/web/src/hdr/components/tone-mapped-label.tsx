"use client";

import { useEditor } from "@/editor/use-editor";

/** Shown while the project has HDR footage: the preview is SDR (HD-09). */
export function ToneMappedLabel() {
	const hasHdr = useEditor((e) =>
		e.media.getAssets().some((a) => a.color && a.color.transfer !== "sdr"),
	);
	if (!hasHdr) return null;
	return (
		<span
			className="rounded border border-amber-400/50 px-1.5 py-0.5 text-[10px] text-amber-300"
			title="HDR clips are shown tone-mapped to SDR. True HDR preview needs an HDR project, which isn't available yet."
			data-tone-mapped-label
		>
			Previewing tone-mapped
		</span>
	);
}
