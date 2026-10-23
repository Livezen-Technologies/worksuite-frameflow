"use client";

import type { MediaColorInfo } from "@/services/storage/types";

/** "HDR · HLG" / "HDR · PQ" on HDR clips in the media bin (HD-01). */
export function HdrBadge({ color }: { color: MediaColorInfo | undefined }) {
	if (!color || color.transfer === "sdr") return null;
	return (
		<span
			className="absolute top-1 right-1 rounded bg-amber-400 px-1 py-px text-[9px] font-bold text-black"
			title={`HDR video (${color.transfer.toUpperCase()}${color.primaries ? `, ${color.primaries}` : ""})${color.maxCll ? `, MaxCLL ${color.maxCll} nits${color.maxFall ? ` / MaxFALL ${color.maxFall}` : ""}` : ""}`}
			data-hdr-badge
		>
			HDR · {color.transfer.toUpperCase()}
		</span>
	);
}
