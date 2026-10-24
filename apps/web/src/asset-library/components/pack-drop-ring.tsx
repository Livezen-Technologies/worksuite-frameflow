"use client";

import { useT } from "@/i18n";
import { cancelPackDrop, usePackDrops } from "../pack-drop";
import { useAssetLibrary } from "../store";

/**
 * Progress ring over a placeholder clip (or the clip / cut a LUT, filter,
 * effect or transition is waiting to go on) while its pack downloads.
 * × cancels: the download stops and the placeholder goes.
 */
export function PackDropRing({ elementId }: { elementId: string }) {
	const t = useT();
	const drop = usePackDrops((s) => Object.values(s.drops).find((d) => d.ring?.elementId === elementId) ?? null);
	const download = useAssetLibrary((s) => (drop ? (s.state?.downloads[drop.packId] ?? null) : null));
	if (!drop) return null;
	const installing = download?.status === "installing";
	const fraction = download && download.total > 0 ? Math.min(1, download.received / download.total) : 0;
	const r = 9;
	const c = 2 * Math.PI * r;
	const label = installing ? t("Installing {name}…", { name: drop.title }) : t("Downloading {name}… {pct}%", { name: drop.title, pct: Math.round(fraction * 100) });
	return (
		<div
			className={`pointer-events-none absolute z-20 flex items-center gap-1 ${drop.kind === "cut" ? "inset-y-0 -left-3" : "inset-y-0.5 left-0.5 max-w-[calc(100%-4px)] rounded bg-black/70 pr-1.5 pl-0.5"}`}
			data-pack-drop={drop.id}
			title={label}
		>
			<svg width="22" height="22" viewBox="0 0 22 22" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
				<circle cx="11" cy="11" r={r} fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.25)" strokeWidth="2.5" />
				<circle
					cx="11"
					cy="11"
					r={r}
					fill="none"
					stroke="#4c8dff"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeDasharray={installing ? `${c * 0.25} ${c}` : `${c * fraction} ${c}`}
					transform="rotate(-90 11 11)"
					className={installing || !download ? "origin-center animate-spin" : undefined}
				/>
			</svg>
			<button
				type="button"
				className="pointer-events-auto rounded bg-black/60 px-1 text-[10px] leading-4 text-white hover:bg-black/80"
				aria-label={t("Cancel")}
				title={t("Cancel")}
				onPointerDown={(e) => e.stopPropagation()}
				onClick={(e) => {
					e.stopPropagation();
					cancelPackDrop(drop.id);
				}}
			>
				×
			</button>
			{/* On a clip the pill covers the clip's own name, so it carries the label itself. */}
			{drop.kind !== "cut" && <span className="truncate text-[11px] leading-4 text-white">{label}</span>}
		</div>
	);
}
