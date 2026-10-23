"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import type { MediaHdrSettings } from "../settings";
import { DEFAULT_TONE_MAP, type Transfer } from "../tonemap";

const SOURCES: { value: "auto" | Transfer; label: string }[] = [
	{ value: "auto", label: "Auto" },
	{ value: "sdr", label: "SDR (Rec. 709)" },
	{ value: "hlg", label: "HDR HLG" },
	{ value: "pq", label: "HDR PQ (HDR10)" },
];

/**
 * Colour source override and tone mapping for one video (HD-05, HD-08).
 * Shown for HDR footage, or when a source was set by hand.
 */
export function HdrSection({ asset }: { asset: MediaAsset }) {
	const editor = useEditor();
	const hdr = useEditor((e) => e.project.getActiveOrNull()?.settings.hdr);
	const saved = hdr?.media?.[asset.id] ?? {};
	const projectToneMap = { ...DEFAULT_TONE_MAP, ...(hdr?.toneMap ?? {}) };
	const [draft, setDraft] = useState<MediaHdrSettings | null>(null);
	const current = { ...saved, ...(draft ?? {}) };
	const detected = asset.color?.transfer ?? "sdr";
	const source = current.source ?? "auto";
	const effective = source === "auto" ? detected : source;

	if (detected === "sdr" && source === "auto") {
		return (
			<div className="flex items-center justify-between border-b px-4 py-3 text-xs">
				<span className="text-muted-foreground">Colour source: SDR</span>
				<select
					className="bg-accent/50 h-7 rounded-md border px-1.5"
					value="auto"
					aria-label="Colour source"
					onChange={(e) =>
						save({
							...saved,
							source: SOURCES.find((s) => s.value === e.target.value)?.value,
						})
					}
				>
					{SOURCES.map((s) => (
						<option key={s.value} value={s.value}>
							{s.value === "auto" ? "Auto (SDR)" : s.label}
						</option>
					))}
				</select>
			</div>
		);
	}

	function save(next: MediaHdrSettings) {
		const project = editor.project.getActive();
		const media = { ...(project.settings.hdr?.media ?? {}), [asset.id]: next };
		void editor.project.updateSettings({
			settings: { hdr: { ...(project.settings.hdr ?? {}), media } },
		});
		setDraft(null);
	}

	const slider = ({
		key,
		label,
		min,
		max,
		step,
		format,
	}: {
		key: "rolloff" | "saturation" | "exposure";
		label: string;
		min: number;
		max: number;
		step: number;
		format: (v: number) => string;
	}) => {
		const value = current[key] ?? projectToneMap[key];
		return (
			<div className="flex flex-col gap-1.5">
				<div className="flex justify-between text-xs">
					<span>{label}</span>
					<span className="text-muted-foreground tabular-nums">
						{format(value)}
					</span>
				</div>
				<Slider
					min={min}
					max={max}
					step={step}
					value={[value]}
					onValueChange={([v]) => setDraft({ ...(draft ?? {}), [key]: v })}
					onValueCommit={([v]) =>
						save({ ...saved, ...(draft ?? {}), [key]: v })
					}
					aria-label={label}
				/>
			</div>
		);
	};

	return (
		<div className="flex flex-col gap-3 border-b px-4 py-3" data-hdr-section>
			<div className="flex items-center justify-between">
				<span className="text-sm font-semibold">HDR</span>
				<span className="rounded bg-amber-400 px-1.5 py-px text-[10px] font-bold text-black">
					{effective === "sdr" ? "SDR" : `${effective.toUpperCase()} → SDR`}
				</span>
			</div>
			<label className="flex items-center justify-between gap-2 text-xs">
				<span>Colour source</span>
				<select
					className="bg-accent/50 h-7 rounded-md border px-1.5"
					value={source}
					onChange={(e) =>
						save({
							...saved,
							source: SOURCES.find((s) => s.value === e.target.value)?.value,
						})
					}
				>
					{SOURCES.map((s) => (
						<option key={s.value} value={s.value}>
							{s.value === "auto"
								? `Auto (${detected.toUpperCase()})`
								: s.label}
						</option>
					))}
				</select>
			</label>
			{effective !== "sdr" && (
				<>
					<p className="text-muted-foreground text-[11px] leading-snug">
						Tone-mapped to SDR: reference white sits at SDR white and brighter
						highlights roll off instead of clipping.
					</p>
					{slider({
						key: "exposure",
						label: "Exposure",
						min: -2,
						max: 2,
						step: 0.1,
						format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} EV`,
					})}
					{slider({
						key: "rolloff",
						label: "Highlight roll-off",
						min: 0,
						max: 1,
						step: 0.05,
						format: (v) => `${Math.round(v * 100)}%`,
					})}
					{slider({
						key: "saturation",
						label: "Saturation",
						min: 0,
						max: 2,
						step: 0.05,
						format: (v) => `${Math.round(v * 100)}%`,
					})}
					<button
						type="button"
						className="text-muted-foreground self-start text-[11px] underline"
						onClick={() => save({ source: saved.source })}
					>
						Use project settings
					</button>
				</>
			)}
		</div>
	);
}
