"use client";

import { useSphereStore } from "../store";

/** "360°" on 360° clips in the media bin (VR-05). */
export function SphereBadge({ mediaId }: { mediaId: string }) {
	const is360 = useSphereStore((s) => !!s.byMedia[mediaId]?.is360);
	if (!is360) return null;
	return (
		<span
			className="absolute top-1 left-1 rounded bg-[#22D3EE] px-1 py-px text-[9px] font-bold text-black"
			data-sphere-badge
		>
			360°
		</span>
	);
}
