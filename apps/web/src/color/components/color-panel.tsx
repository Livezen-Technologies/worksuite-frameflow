"use client";

import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { isVisualElement } from "@/timeline/element-utils";
import type { TimelineElement, VisualElement } from "@/timeline";
import type { ParamValues } from "@/params";
import type { Effect } from "@/effects/types";
import {
	COLOR_GRADE_EFFECT_TYPE,
	COLOR_SLIDERS,
	COLOR_WHEELS,
	colorGradeEffectDefinition,
	isNeutralGrade,
	wheelParamKeys,
} from "@/effects/definitions/color-grade";
import { cn } from "@/utils/ui";
import { COLOR_LOOKS } from "../looks";
import { ColorWheel } from "./color-wheel";
import { ScopesView } from "./scopes-view";
import { LutSection } from "@/lut/components/lut-section";
import { CurvesSection } from "./curves-section";

const NEUTRAL: ParamValues = Object.fromEntries(
	colorGradeEffectDefinition.params.map((param) => [param.key, param.default]),
);

/** The copied grade, kept for this session only. */
const useGradeClipboard = create<{
	grade: ParamValues | null;
	set: (grade: ParamValues) => void;
}>((set) => ({ grade: null, set: (grade) => set({ grade }) }));

function findGrade(element: TimelineElement): Effect | undefined {
	return isVisualElement(element)
		? (element.effects ?? []).find(
				(effect) => effect.type === COLOR_GRADE_EFFECT_TYPE,
			)
		: undefined;
}

function num({ params, key }: { params: ParamValues; key: string }): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Color tab of the tools panel (SRS 17.2, canvas screen 13). */
export function ColorPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const selected = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => isVisualElement(element));

	const actions = <ScopesToggle />;

	if (selected.length === 0) {
		return (
			<PanelView title="Color" actions={actions}>
				<ScopesIfShown />
				<LutSection />
				<p className="text-muted-foreground p-1 text-sm leading-relaxed">
					Select a video or image clip on the timeline to grade it.
				</p>
			</PanelView>
		);
	}

	const { element, track } = selected[0];
	if (!isVisualElement(element)) return null;
	const grade = findGrade(element);

	return (
		<PanelView title="Color" actions={actions}>
			<ScopesIfShown />
			<LutSection />
			{grade ? (
				<GradeControls
					key={`${track.id}:${element.id}`}
					trackId={track.id}
					element={element}
					effectId={grade.id}
					selectionCount={selected.length}
				/>
			) : (
				<div className="flex flex-col gap-3 p-1">
					<p className="text-muted-foreground m-0 text-sm leading-relaxed">
						{selected.length > 1
							? `${selected.length} clips selected. The first one, “${element.name}”, has no grade yet.`
							: `“${element.name}” has no grade yet.`}
					</p>
					<Button
						onClick={() =>
							editor.timeline.addClipEffect({
								trackId: track.id,
								elementId: element.id,
								effectType: COLOR_GRADE_EFFECT_TYPE,
							})
						}
					>
						Add color grade
					</Button>
					<PasteGradeButton />
				</div>
			)}
			<CurvesSection
				key={`curves:${track.id}:${element.id}`}
				trackId={track.id}
				element={element}
			/>
		</PanelView>
	);
}

const useScopesShown = create<{ shown: boolean; toggle: () => void }>(
	(set) => ({
		shown: true,
		toggle: () => set((state) => ({ shown: !state.shown })),
	}),
);

function ScopesToggle() {
	const { shown, toggle } = useScopesShown();
	return (
		<Button variant="outline" size="sm" aria-pressed={shown} onClick={toggle}>
			Scopes
		</Button>
	);
}

function ScopesIfShown() {
	const shown = useScopesShown((s) => s.shown);
	return shown ? (
		<div className="mb-3">
			<ScopesView />
		</div>
	) : null;
}

/** Applies a grade to every selected visual clip, adding the effect where missing. */
function useApplyGradeToSelection() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	return (params: ParamValues) => {
		const targets = editor.timeline
			.getElementsWithTracks({ elements: selectedElements })
			.filter(({ element }) => isVisualElement(element));
		for (const { element, track } of targets) {
			const effectId =
				findGrade(element)?.id ??
				editor.timeline.addClipEffect({
					trackId: track.id,
					elementId: element.id,
					effectType: COLOR_GRADE_EFFECT_TYPE,
				});
			editor.timeline.updateClipEffectParams({
				trackId: track.id,
				elementId: element.id,
				effectId,
				params,
			});
		}
		return targets.length;
	};
}

function PasteGradeButton() {
	const copied = useGradeClipboard((s) => s.grade);
	const apply = useApplyGradeToSelection();
	if (!copied) return null;
	return (
		<Button
			variant="outline"
			className="bg-accent"
			onClick={() => {
				const count = apply(copied);
				toast.success(
					`Pasted the grade to ${count} clip${count === 1 ? "" : "s"}`,
				);
			}}
		>
			Paste grade
		</Button>
	);
}

function GradeControls({
	trackId,
	element,
	effectId,
	selectionCount,
}: {
	trackId: string;
	element: VisualElement;
	effectId: string;
	selectionCount: number;
}) {
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const copyGrade = useGradeClipboard((s) => s.set);
	const copied = useGradeClipboard((s) => s.grade);
	const applyToSelection = useApplyGradeToSelection();
	const [comparing, setComparing] = useState(false);

	const liveEffects =
		(renderElement as VisualElement).effects ?? element.effects ?? [];
	const effect = liveEffects.find((e) => e.id === effectId);
	const params: ParamValues = { ...NEUTRAL, ...(effect?.params ?? {}) };

	const preview = (changes: ParamValues) => {
		previewUpdates({
			effects: liveEffects.map((existing) =>
				existing.id === effectId
					? { ...existing, params: { ...existing.params, ...changes } }
					: existing,
			),
		});
	};

	const setAll = (next: ParamValues) => {
		editor.timeline.updateClipEffectParams({
			trackId,
			elementId: element.id,
			effectId,
			params: next,
		});
	};

	// Hold to see the clip without its grade. Only the preview changes; the
	// project keeps the grade.
	const startCompare = () => {
		setComparing(true);
		previewUpdates({
			effects: liveEffects.map((existing) =>
				existing.id === effectId ? { ...existing, enabled: false } : existing,
			),
		});
	};
	const endCompare = () => {
		if (!comparing) return;
		setComparing(false);
		editor.timeline.discardPreview();
	};

	return (
		<div className="flex flex-col gap-4 pb-4">
			<div className="flex flex-wrap items-center gap-1.5">
				<span
					className="min-w-0 flex-1 truncate text-sm font-medium"
					title={element.name}
				>
					{element.name}
				</span>
				<Button
					variant="outline"
					size="sm"
					aria-pressed={comparing}
					onPointerDown={startCompare}
					onPointerUp={endCompare}
					onPointerLeave={endCompare}
					onKeyDown={(event) =>
						(event.key === " " || event.key === "Enter") && startCompare()
					}
					onKeyUp={endCompare}
					title="Hold to see the clip before grading"
				>
					{comparing ? "Before" : "Hold: before"}
				</Button>
			</div>

			<div className="flex flex-wrap gap-1.5">
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						copyGrade(params);
						toast.success("Grade copied");
					}}
				>
					Copy grade
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={!copied}
					onClick={() => {
						if (!copied) return;
						const count = applyToSelection(copied);
						toast.success(
							`Pasted the grade to ${count} clip${count === 1 ? "" : "s"}`,
						);
					}}
				>
					Paste{selectionCount > 1 ? ` to ${selectionCount} selected` : ""}
				</Button>
				{selectionCount > 1 && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							const count = applyToSelection(params);
							toast.success(`Applied this grade to ${count} clips`);
						}}
					>
						Apply to all selected
					</Button>
				)}
				<Button
					variant="ghost"
					size="sm"
					disabled={isNeutralGrade(params)}
					onClick={() => setAll(NEUTRAL)}
				>
					Reset
				</Button>
			</div>

			<section aria-labelledby="color-wheels" className="flex flex-col gap-2">
				<h3 id="color-wheels" className="m-0 text-xs font-semibold">
					Primary wheels
				</h3>
				<div className="grid grid-cols-2 gap-x-3 gap-y-4">
					{COLOR_WHEELS.map((wheel) => {
						const keys = wheelParamKeys(wheel.key);
						return (
							<ColorWheel
								key={wheel.key}
								label={wheel.label}
								x={num({ params, key: keys.x })}
								y={num({ params, key: keys.y })}
								master={num({ params, key: keys.m })}
								onPreview={(values) =>
									preview({
										...(values.x !== undefined ? { [keys.x]: values.x } : {}),
										...(values.y !== undefined ? { [keys.y]: values.y } : {}),
										...(values.master !== undefined
											? { [keys.m]: values.master }
											: {}),
									})
								}
								onCommit={commit}
							/>
						);
					})}
				</div>
			</section>

			<section aria-labelledby="color-adjust" className="flex flex-col gap-2">
				<h3 id="color-adjust" className="m-0 text-xs font-semibold">
					Adjust
				</h3>
				{COLOR_SLIDERS.map((slider) => {
					const value = num({ params, key: slider.key });
					return (
						<label
							key={slider.key}
							className="grid grid-cols-[84px_1fr_44px] items-center gap-2 text-xs"
						>
							{slider.label}
							<input
								type="range"
								min={slider.min}
								max={slider.max}
								step={slider.step}
								value={value}
								onChange={(event) =>
									preview({ [slider.key]: Number(event.target.value) })
								}
								onPointerUp={commit}
								onKeyUp={commit}
								onDoubleClick={() => {
									preview({ [slider.key]: 0 });
									commit();
								}}
								className="accent-primary w-full"
							/>
							<span className="text-muted-foreground text-right tabular-nums">
								{value > 0 ? "+" : ""}
								{slider.key === "exposure"
									? value.toFixed(2)
									: Math.round(value)}
							</span>
						</label>
					);
				})}
			</section>

			<section aria-labelledby="color-looks" className="flex flex-col gap-2">
				<h3 id="color-looks" className="m-0 text-xs font-semibold">
					Looks
				</h3>
				<div className="flex flex-wrap gap-1.5">
					{COLOR_LOOKS.map((look) => (
						<button
							key={look.id}
							type="button"
							onClick={() => setAll({ ...NEUTRAL, ...look.params })}
							className={cn(
								"bg-popover hover:bg-secondary hover:text-secondary-foreground rounded-full border px-3 py-1 text-xs",
							)}
						>
							{look.name}
						</button>
					))}
				</div>
				<p className="text-muted-foreground m-0 text-[11px]">
					A look replaces the current grade. Undo brings it back.
				</p>
			</section>
		</div>
	);
}
