"use client";

import { Crosshair, Globe, RotateCcw, Trash2 } from "lucide-react";
import { buildEffectParamPath } from "@/animation";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import type { Effect } from "@/effects/types";
import { resolveEffectParamsAtTime } from "@/animation";
import type { ParamDefinition, ParamValues } from "@/params";
import type { VisualElement } from "@/timeline";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";
import type { MediaTime } from "@/wasm";
import { cameraAtPlayhead, CAMERA_KEYS, setCamera } from "../camera";
import {
	findReframeEffect,
	PROJECTION_STYLES,
	REFRAME_PARAMS,
	withoutReframe,
	withReframe,
} from "../projection";
import { useSphereStore } from "../store";

function CameraParamField({
	param,
	trackId,
	element,
	effect,
	localTime,
	isPlayheadWithinElementRange,
	resolvedParams,
}: {
	param: ParamDefinition;
	trackId: string;
	element: VisualElement;
	effect: Effect;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	resolvedParams: ParamValues;
}) {
	const value = resolvedParams[param.key] ?? param.default;
	const animated = useKeyframedParamProperty({
		param,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: buildEffectParamPath({
			effectId: effect.id,
			paramKey: param.key,
		}),
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue: value,
		buildBaseUpdates: ({ value: next }) => ({
			effects: (element.effects ?? []).map((e) =>
				e.id === effect.id
					? { ...e, params: { ...e.params, [param.key]: next } }
					: e,
			),
		}),
	});
	return (
		<PropertyParamField
			param={param}
			value={value}
			onPreview={animated.onPreview}
			onCommit={animated.onCommit}
			keyframe={{
				isActive: animated.isKeyframedAtTime,
				isDisabled: !isPlayheadWithinElementRange,
				onToggle: animated.toggleKeyframe,
			}}
		/>
	);
}

/** 360° tab for video clips (VR-01, VR-08–VR-10, VR-16). */
export function SphereTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const live = renderElement as VisualElement;
	const effect = findReframeEffect(live.effects);
	const projectId = editor.project.getActive().metadata.id;
	const sphereProject = useSphereStore((s) => !!s.sphereProjects[projectId]);

	const setEffects = (effects: Effect[]) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: { effects } }],
		});

	if (!effect) {
		return (
			<div className="flex flex-col gap-3 p-4" data-sphere-tab>
				<p className="text-muted-foreground m-0 text-xs leading-relaxed">
					For stitched 360° video (equirectangular, 2:1). Add a virtual camera
					to aim, zoom and keyframe the view, or keep the clip 360°.
				</p>
				<Button
					onClick={() => {
						if ("mediaId" in element && typeof element.mediaId === "string") {
							useSphereStore.getState().setInfo({
								mediaId: element.mediaId,
								info: { is360: true, source: "manual" },
							});
						}
						useSphereStore.getState().markHandled([element.id]);
						setEffects(
							withReframe({
								effects: element.effects,
								makeId: generateUUID,
								params: sphereProject ? { mode: "sphere" } : {},
							}),
						);
					}}
				>
					<Globe /> This is 360°
				</Button>
			</div>
		);
	}

	const resolvedParams = resolveEffectParamsAtTime({
		effectId: effect.id,
		params: effect.params,
		animations: live.animations,
		localTime,
	});
	const target = { trackId, element };
	const sphereMode = effect.params.mode === "sphere";
	const fields = REFRAME_PARAMS.filter(
		(p) =>
			p.key !== "mode" &&
			(!sphereMode || p.key === "yaw" || p.key === "pitch" || p.key === "roll"),
	);

	return (
		<div className="flex flex-col" data-sphere-tab>
			<Section sectionKey={`${element.id}:sphere`}>
				<SectionHeader>
					<SectionTitle>360° camera</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<div className="mb-3 grid grid-cols-2 gap-1">
						{(
							[
								["reframe", "Reframe"],
								["sphere", "Keep 360°"],
							] as const
						).map(([mode, label]) => (
							<button
								key={mode}
								type="button"
								onClick={() => setCamera({ editor, target, values: { mode } })}
								className={cn(
									"h-8 rounded-md border text-xs",
									(effect.params.mode ?? "reframe") === mode
										? "bg-primary text-primary-foreground border-primary"
										: "hover:bg-accent",
								)}
							>
								{label}
							</button>
						))}
					</div>
					{!sphereMode && (
						<div className="mb-3 grid grid-cols-4 gap-1">
							{PROJECTION_STYLES.map((style) => (
								<button
									key={style.value}
									type="button"
									data-projection-style={style.value}
									onClick={() =>
										setCamera({ editor, target, values: style.params })
									}
									className="hover:bg-accent rounded-md border px-1 py-1.5 text-[10px] leading-tight"
								>
									{style.label}
								</button>
							))}
						</div>
					)}
					<SectionFields>
						{fields.map((param) => (
							<CameraParamField
								key={param.key}
								param={param}
								trackId={trackId}
								element={live}
								effect={effect}
								localTime={localTime}
								isPlayheadWithinElementRange={isPlayheadWithinElementRange}
								resolvedParams={resolvedParams}
							/>
						))}
					</SectionFields>
					<p className="text-muted-foreground mt-2 mb-0 text-[11px] leading-relaxed">
						{sphereMode
							? "Turns the whole sphere to set which way is front. Drag the preview to turn it."
							: "Drag the preview to aim, scroll to zoom. Lens blends Natural → Wide → Tiny planet, so keyframes animate between them."}
					</p>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={!isPlayheadWithinElementRange}
							data-sphere-keyframe
							onClick={() =>
								setCamera({
									editor,
									target,
									values: cameraAtPlayhead({ editor, element }),
									keyframe: true,
								})
							}
						>
							<Crosshair /> Keyframe view
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								setCamera({
									editor,
									target,
									values: Object.fromEntries(
										CAMERA_KEYS.map((key) => [
											key,
											Number(
												REFRAME_PARAMS.find((p) => p.key === key)?.default ?? 0,
											),
										]),
									),
								})
							}
						>
							<RotateCcw /> Reset view
						</Button>
					</div>
					<Button
						size="sm"
						variant="text"
						className="mt-2 w-full"
						onClick={() => setEffects(withoutReframe(element.effects))}
					>
						<Trash2 /> Not 360° (remove camera)
					</Button>
				</SectionContent>
			</Section>
		</div>
	);
}
