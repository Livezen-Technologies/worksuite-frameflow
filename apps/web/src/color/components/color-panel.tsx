"use client";

import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
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
import { CURVES_EFFECT_TYPE } from "@/effects/definitions/curves";
import { LUT_EFFECT_TYPE } from "@/effects/definitions/lut";
import {
	type GradeTarget,
	useClipGradeTarget,
	useTimelineGradeTarget,
} from "../grade-target";

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

const useGradeScope = create<{ scope: "clip" | "timeline"; set: (scope: "clip" | "timeline") => void }>((set) => ({
	scope: "clip",
	set: (scope) => set({ scope }),
}));

/** Color tab of the tools panel (SRS 17.2, canvas screen 13). */
export function ColorPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	const { selectedElements } = useElementSelection();
	const scope = useGradeScope((s) => s.scope);
	const setScope = useGradeScope((s) => s.set);
	const selected = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => isVisualElement(element));

	const actions = <ScopesToggle />;
	const scopeSwitch = (
		<div className="mb-3 grid grid-cols-2 gap-1 rounded-md border p-0.5 text-xs" data-grade-scope>
			{(["clip", "timeline"] as const).map((s) => (
				<button
					key={s}
					type="button"
					data-grade-scope-option={s}
					aria-pressed={scope === s}
					onClick={() => setScope(s)}
					className={cn("rounded px-2 py-1", scope === s ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
				>
					{s === "clip" ? "Clip" : "Whole timeline"}
				</button>
			))}
		</div>
	);

	if (scope === "timeline") {
		return (
			<PanelView title="Color" actions={actions}>
				<ScopesIfShown />
				{scopeSwitch}
				<TimelineGrade />
			</PanelView>
		);
	}

	if (selected.length === 0) {
		return (
			<PanelView title="Color" actions={actions}>
				<ScopesIfShown />
				{scopeSwitch}
				<LutSection />
				<p className="text-muted-foreground p-1 text-sm leading-relaxed">
					Select a video or image clip on the timeline to grade it, or grade the whole timeline.
				</p>
			</PanelView>
		);
	}

	const { element, track } = selected[0];
	if (!isVisualElement(element)) return null;

	return (
		<PanelView title="Color" actions={actions}>
			<ScopesIfShown />
			{scopeSwitch}
			<LutSection />
			<ClipGrade key={`${track.id}:${element.id}`} trackId={track.id} element={element} selectionCount={selected.length} />
		</PanelView>
	);
}

function ClipGrade({
	trackId,
	element,
	selectionCount,
}: {
	trackId: string;
	element: VisualElement;
	selectionCount: number;
}) {
	const target = useClipGradeTarget({ trackId, element });
	return <GradeNodes target={target} selectionCount={selectionCount} />;
}

function TimelineGrade() {
	const target = useTimelineGradeTarget();
	return <GradeNodes target={target} selectionCount={0} />;
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

const NODE_TYPES = [
	{ type: COLOR_GRADE_EFFECT_TYPE, label: "Wheels & sliders" },
	{ type: CURVES_EFFECT_TYPE, label: "Curves & HSL" },
] as const;
const COLOUR_TYPES = new Set<string>([COLOR_GRADE_EFFECT_TYPE, CURVES_EFFECT_TYPE, LUT_EFFECT_TYPE]);
const nodeLabel = (type: string) =>
	type === LUT_EFFECT_TYPE ? "LUT" : (NODE_TYPES.find((n) => n.type === type)?.label ?? type);

/** The grade as an ordered stack of nodes, applied top to bottom (WS-12). */
function GradeNodes({ target, selectionCount }: { target: GradeTarget; selectionCount: number }) {
	const nodes = target.effects
		.map((effect, index) => ({ effect, index }))
		.filter(({ effect }) => COLOUR_TYPES.has(effect.type));
	const [chosen, setChosen] = useState<string | null>(null);
	const active = nodes.find((n) => n.effect.id === chosen) ?? nodes[0];

	return (
		<div className="flex flex-col gap-3">
			<section className="flex flex-col gap-1" data-grade-nodes>
				<div className="flex items-center justify-between">
					<h3 className="m-0 text-xs font-semibold">
						{target.kind === "timeline" ? "Timeline grade" : "Grade nodes"}
					</h3>
					{target.kind === "timeline" && (
						<span className="text-muted-foreground text-[11px]">Over every clip</span>
					)}
				</div>
				{nodes.map(({ effect, index }, n) => (
					<div
						key={effect.id}
						data-grade-node={effect.type}
						className={cn(
							"flex items-center gap-1 rounded border px-1.5 py-1 text-xs",
							active?.effect.id === effect.id ? "border-primary bg-primary/10" : "",
							!effect.enabled && "opacity-50",
						)}
					>
						<button type="button" className="flex-1 truncate text-left" onClick={() => setChosen(effect.id)}>
							{n + 1}. {nodeLabel(effect.type)}
						</button>
						<button
							type="button"
							className="hover:bg-accent rounded px-1"
							title={effect.enabled ? "Turn off" : "Turn on"}
							data-node-toggle
							onClick={() => target.toggle(effect.id)}
						>
							{effect.enabled ? "On" : "Off"}
						</button>
						<button
							type="button"
							className="hover:bg-accent rounded px-1 disabled:opacity-30"
							aria-label="Move up"
							disabled={n === 0}
							onClick={() => target.move({ fromIndex: index, toIndex: nodes[n - 1]!.index })}
						>
							↑
						</button>
						<button
							type="button"
							className="hover:bg-accent rounded px-1 disabled:opacity-30"
							aria-label="Move down"
							disabled={n === nodes.length - 1}
							data-node-down
							onClick={() => target.move({ fromIndex: index, toIndex: nodes[n + 1]!.index })}
						>
							↓
						</button>
						<button
							type="button"
							className="hover:bg-accent rounded px-1"
							aria-label="Delete node"
							onClick={() => target.remove(effect.id)}
						>
							×
						</button>
					</div>
				))}
				<div className="flex flex-wrap gap-1">
					{NODE_TYPES.map((node) => (
						<Button
							key={node.type}
							size="sm"
							variant="outline"
							className="h-6 text-[11px]"
							data-add-node={node.type}
							onClick={() => setChosen(target.add(node.type))}
						>
							+ {node.label}
						</Button>
					))}
				</div>
				{!nodes.length && target.kind === "clip" && <PasteGradeButton />}
			</section>
			{active?.effect.type === COLOR_GRADE_EFFECT_TYPE && (
				<GradeControls key={active.effect.id} target={target} effectId={active.effect.id} selectionCount={selectionCount} />
			)}
			{active?.effect.type === CURVES_EFFECT_TYPE && (
				<CurvesSection key={active.effect.id} target={target} effectId={active.effect.id} />
			)}
			{active?.effect.type === LUT_EFFECT_TYPE && (
				<p className="text-muted-foreground m-0 text-xs">Change this LUT in the LUT section above.</p>
			)}
		</div>
	);
}

function GradeControls({
	target,
	effectId,
	selectionCount,
}: {
	target: GradeTarget;
	effectId: string;
	selectionCount: number;
}) {
	const copyGrade = useGradeClipboard((s) => s.set);
	const copied = useGradeClipboard((s) => s.grade);
	const applyToSelection = useApplyGradeToSelection();
	const [comparing, setComparing] = useState(false);

	const liveEffects = target.effects;
	const effect = liveEffects.find((e) => e.id === effectId);
	const params: ParamValues = { ...NEUTRAL, ...(effect?.params ?? {}) };
	const commit = target.commitPreview;

	const preview = (changes: ParamValues) => {
		target.preview(
			liveEffects.map((existing) =>
				existing.id === effectId
					? { ...existing, params: { ...existing.params, ...changes } }
					: existing,
			),
		);
	};

	const setAll = (next: ParamValues) => target.setParams({ effectId, params: next });
	const paste = (grade: ParamValues) =>
		target.kind === "clip" ? applyToSelection(grade) : (setAll(grade), 1);

	// Hold to see the picture without this node. Only the preview changes.
	const startCompare = () => {
		setComparing(true);
		target.preview(
			liveEffects.map((existing) =>
				existing.id === effectId ? { ...existing, enabled: false } : existing,
			),
		);
	};
	const endCompare = () => {
		if (!comparing) return;
		setComparing(false);
		target.discardPreview();
	};
	const element = { name: target.name };

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
						const count = paste(copied);
						toast.success(
							target.kind === "timeline"
								? "Pasted the grade to the timeline"
								: `Pasted the grade to ${count} clip${count === 1 ? "" : "s"}`,
						);
					}}
				>
					Paste{selectionCount > 1 ? ` to ${selectionCount} selected` : ""}
				</Button>
				{target.kind === "clip" && selectionCount > 1 && (
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
