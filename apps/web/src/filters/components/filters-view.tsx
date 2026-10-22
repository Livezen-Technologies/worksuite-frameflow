"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { isVisualElement } from "@/timeline/element-utils";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";
import {
	FILTER_CATEGORIES,
	FILTER_PRESETS,
	type FilterCategory,
	type FilterPreset,
	filterGradeParams,
	readClipFilter,
	withFilter,
} from "../library";

type Filter = "All" | FilterCategory;

/** The filter's colour grade on the shared preview picture. */
function FilterThumb({ preset }: { preset: FilterPreset }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const render = () => {
			if (!canvasRef.current) return;
			effectPreviewService.renderPreview({
				effectType: "color-grade",
				params: filterGradeParams({ preset, strength: 100 }),
				targetCanvas: canvasRef.current,
			});
		};
		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [preset]);
	return (
		<canvas
			ref={canvasRef}
			className={cn(
				"size-full",
				// Finishing touches the grade preview can't show.
				preset.extras?.some((e) => e.type === "sepia") && "sepia",
			)}
		/>
	);
}

export function FiltersView() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const [filter, setFilter] = useState<Filter>("All");
	const [dragStrength, setDragStrength] = useState<number | null>(null);

	const targets = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.flatMap(({ track, element }) =>
			isVisualElement(element) ? [{ track, element }] : [],
		);
	const current =
		targets.length > 0 ? readClipFilter(targets[0].element.effects) : null;
	const currentPreset =
		FILTER_PRESETS.find((p) => p.id === current?.id) ?? null;

	const visible = useMemo(
		() =>
			FILTER_PRESETS.filter((p) => filter === "All" || p.category === filter),
		[filter],
	);

	const apply = ({
		preset,
		strength = 100,
	}: {
		preset: FilterPreset | null;
		strength?: number;
	}) => {
		if (targets.length === 0) {
			toast.info(
				"Select a video or photo clip on the timeline to apply a filter",
			);
			return;
		}
		editor.timeline.updateElements({
			updates: targets.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: {
					effects: withFilter({
						effects: element.effects,
						preset,
						strength,
						makeId: generateUUID,
					}),
				},
			})),
		});
	};

	const filters: Filter[] = ["All", ...FILTER_CATEGORIES];
	const strength = dragStrength ?? current?.strength ?? 100;

	return (
		<PanelView title="Filters">
			<div className="flex flex-col gap-3" data-filters-view>
				<div className="flex flex-wrap gap-1">
					{filters.map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFilter(f)}
							className={cn(
								"rounded-full border px-2 py-0.5 text-[11px]",
								filter === f
									? "bg-primary text-primary-foreground border-primary"
									: "text-muted-foreground hover:bg-accent",
							)}
						>
							{f}
						</button>
					))}
				</div>

				{currentPreset ? (
					<div
						className="bg-accent/40 flex flex-col gap-2 rounded-xl border p-3"
						data-filter-strength
					>
						<div className="flex justify-between text-xs">
							<span>
								<b>{currentPreset.name}</b> strength
							</span>
							<span className="tabular-nums">{Math.round(strength)}%</span>
						</div>
						<Slider
							value={[strength]}
							min={0}
							max={100}
							step={1}
							onValueChange={([value]) => setDragStrength(value)}
							onValueCommit={([value]) => {
								setDragStrength(null);
								apply({ preset: currentPreset, strength: value });
							}}
						/>
					</div>
				) : (
					<p className="text-muted-foreground text-[11px]">
						{targets.length > 0
							? `Pick a filter for ${targets.length === 1 ? "the selected clip" : `${targets.length} selected clips`}.`
							: "Select a video or photo clip, then pick a filter."}
					</p>
				)}

				<div className="grid grid-cols-3 gap-x-2 gap-y-3">
					<button
						type="button"
						onClick={() => apply({ preset: null })}
						data-filter="none"
						className="group flex min-w-0 flex-col items-center gap-1"
					>
						<span
							className={cn(
								"flex aspect-square w-full items-center justify-center rounded-xl bg-[#0b0d12]",
								!current && targets.length > 0
									? "ring-2 ring-[#22D3EE] ring-offset-2 ring-offset-background"
									: "ring-1 ring-white/5 group-hover:ring-white/20",
							)}
						>
							<Ban className="text-muted-foreground size-6" strokeWidth={1.5} />
						</span>
						<span className="text-muted-foreground w-full truncate text-center text-[11px]">
							None
						</span>
					</button>
					{visible.map((preset) => {
						const active = current?.id === preset.id;
						return (
							<button
								key={preset.id}
								type="button"
								data-filter={preset.id}
								aria-pressed={active}
								onClick={() => apply({ preset })}
								className="group flex min-w-0 flex-col items-center gap-1"
							>
								<span
									className={cn(
										"aspect-square w-full overflow-hidden rounded-xl",
										active
											? "ring-2 ring-[#22D3EE] ring-offset-2 ring-offset-background"
											: "ring-1 ring-white/5 group-hover:ring-white/20",
									)}
								>
									<FilterThumb preset={preset} />
								</span>
								<span
									className={cn(
										"w-full truncate text-center text-[11px]",
										active ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{preset.name}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</PanelView>
	);
}
