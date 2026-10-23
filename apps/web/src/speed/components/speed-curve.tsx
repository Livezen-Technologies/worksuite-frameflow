"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useEditor } from "@/editor/use-editor";
import type { AudioElement, VideoElement } from "@/timeline";
import { cn } from "@/utils/ui";
import { readCurve, setSpeedCurve } from "../apply-curve";
import { CURVE_PRESETS, type CurvePresetId, curveAt } from "../curves";

function CurveIcon({ points }: { points: number[] }) {
	const w = 64;
	const h = 32;
	const max = 3;
	const y = (v: number) =>
		h - 3 - ((Math.log(v) - Math.log(1 / max)) / (Math.log(max) * 2)) * (h - 6);
	const path = Array.from({ length: 33 }, (_, i) => {
		const u = i / 32;
		return `${i === 0 ? "M" : "L"}${(u * w).toFixed(1)},${y(curveAt({ points, u })).toFixed(1)}`;
	}).join(" ");
	return (
		<svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-16" aria-hidden>
			<line
				x1={0}
				x2={w}
				y1={y(1)}
				y2={y(1)}
				className="stroke-muted-foreground/30"
				strokeDasharray="2 2"
			/>
			<path
				d={path}
				fill="none"
				className="stroke-foreground"
				strokeWidth={1.75}
			/>
		</svg>
	);
}

/** Speed › Curve: presets and a custom curve (applied as speed pieces). */
export function SpeedCurvePanel({
	element,
	trackId,
}: {
	element: AudioElement | VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const curve = readCurve(element);
	const active: CurvePresetId | "none" = curve?.preset ?? "none";
	const [custom, setCustom] = useState<number[]>(
		curve?.preset === "custom" && curve.points.length === 5
			? curve.points
			: [1, 1, 1, 1, 1],
	);

	const apply = ({
		preset,
		points,
	}: {
		preset: CurvePresetId | null;
		points: number[] | null;
	}) => {
		const id = setSpeedCurve({ editor, trackId, element, preset, points });
		if (id)
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId: id }],
			});
	};

	return (
		<div className="flex flex-col gap-3" data-speed-curve>
			<div className="grid grid-cols-4 gap-2">
				<button
					type="button"
					onClick={() => apply({ preset: null, points: null })}
					data-curve="none"
					className="flex flex-col items-center gap-1 text-[11px]"
				>
					<span
						className={cn(
							"bg-muted/60 flex h-14 w-full items-center justify-center rounded-lg border-2",
							active === "none" ? "border-[#22D3EE]" : "border-transparent",
						)}
					>
						<Ban className="text-muted-foreground size-5" />
					</span>
					None
				</button>
				{CURVE_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						data-curve={preset.id}
						onClick={() =>
							apply({
								preset: preset.id,
								points: preset.id === "custom" ? custom : preset.points,
							})
						}
						className="flex flex-col items-center gap-1 text-[11px]"
					>
						<span
							className={cn(
								"bg-muted/60 flex h-14 w-full items-center justify-center rounded-lg border-2",
								active === preset.id
									? "border-[#22D3EE]"
									: "border-transparent",
							)}
						>
							<CurveIcon
								points={preset.id === "custom" ? custom : preset.points}
							/>
						</span>
						{preset.label}
					</button>
				))}
			</div>
			{active === "custom" && (
				<div className="flex flex-col gap-2 rounded-lg border p-3">
					<span className="text-muted-foreground text-xs">
						Speed at 5 points through the clip (0.1× – 5×)
					</span>
					<div className="flex items-end justify-between gap-2">
						{custom.map((value, i) => (
							<label
								key={i}
								className="flex flex-1 flex-col items-center gap-1 text-[10px]"
							>
								<input
									type="range"
									min={-2.3}
									max={1.6}
									step={0.01}
									value={Math.log(value)}
									onChange={(e) => {
										const next = [...custom];
										next[i] =
											Math.round(Math.exp(Number(e.target.value)) * 100) / 100;
										setCustom(next);
									}}
									onPointerUp={() =>
										apply({ preset: "custom", points: custom })
									}
									onKeyUp={() => apply({ preset: "custom", points: custom })}
									className="h-24 w-4 [writing-mode:vertical-lr] [direction:rtl]"
									aria-label={`Speed at point ${i + 1}`}
								/>
								{value.toFixed(2)}×
							</label>
						))}
					</div>
				</div>
			)}
			<p className="text-muted-foreground m-0 text-[11px] leading-relaxed">
				A curve speeds the clip up and slows it down over its length; its
				duration changes and the clips after it move along.
			</p>
		</div>
	);
}
