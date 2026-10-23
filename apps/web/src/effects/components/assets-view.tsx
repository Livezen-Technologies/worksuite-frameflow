"use client";

import { hdrUnsupportedReason } from "@/effects/hdr-support";
import { useSphereStore } from "@/vr/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Input } from "@/components/ui/input";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { buildEffectElement, isVisualElement } from "@/timeline/element-utils";
import type { EffectCategory, EffectDefinition } from "@/effects/types";
import { cn } from "@/utils/ui";
import { useEffectLibrary, type EffectStackPreset } from "../presets";
import { PrivacyButtons } from "@/privacy/components/privacy-buttons";

const CATEGORIES: (EffectCategory | "All" | "Favourites" | "My presets")[] = [
	"All",
	"Blur",
	"Stylise",
	"Distort",
	"Light",
	"Retro",
	"Color",
	"Favourites",
	"My presets",
];

/** Adds effects to every selected visual clip; returns how many got them. */
function useAddToSelection() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	return (
		effects: {
			type: string;
			params?: EffectStackPreset["effects"][number]["params"];
		}[],
	) => {
		const targets = editor.timeline
			.getElementsWithTracks({ elements: selectedElements })
			.filter(({ element }) => isVisualElement(element));
		for (const { track, element } of targets) {
			for (const effect of effects) {
				const effectId = editor.timeline.addClipEffect({
					trackId: track.id,
					elementId: element.id,
					effectType: effect.type,
				});
				if (effect.params && effectId) {
					editor.timeline.updateClipEffectParams({
						trackId: track.id,
						elementId: element.id,
						effectId,
						params: effect.params,
					});
				}
			}
		}
		return targets.length;
	};
}

export function EffectsView() {
	const effects = effectsRegistry.getAll();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
	const favourites = useEffectLibrary((s) => s.favourites);
	const presets = useEffectLibrary((s) => s.presets);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return effects.filter((effect) => {
			if (category === "Favourites" && !favourites.includes(effect.type))
				return false;
			if (
				category !== "All" &&
				category !== "Favourites" &&
				effect.category !== category
			)
				return false;
			return (
				!q ||
				effect.name.toLowerCase().includes(q) ||
				effect.keywords.some((keyword) => keyword.includes(q))
			);
		});
	}, [effects, query, category, favourites]);

	return (
		<PanelView title="Effects">
			<div className="flex flex-col gap-3 pb-3">
				<label htmlFor="effect-search" className="sr-only">
					Search effects
				</label>
				<Input
					id="effect-search"
					placeholder={`Search ${effects.length} effects`}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<PrivacyButtons />
				<div
					className="flex flex-wrap gap-1"
					role="group"
					aria-label="Category"
				>
					{CATEGORIES.map((name) => (
						<button
							key={name}
							type="button"
							aria-pressed={category === name}
							onClick={() => setCategory(name)}
							className={cn(
								"h-7 rounded-full border px-2.5 text-xs",
								category === name
									? "bg-secondary text-secondary-foreground"
									: "bg-popover hover:bg-accent",
							)}
						>
							{name}
						</button>
					))}
				</div>
				{category === "My presets" ? (
					<PresetList presets={presets} />
				) : (
					<>
						<div
							className="grid gap-2"
							style={{
								gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
							}}
						>
							{visible.map((effect) => (
								<EffectItem
									key={effect.type}
									effect={effect}
									isFavourite={favourites.includes(effect.type)}
								/>
							))}
						</div>
						{visible.length === 0 && (
							<p className="text-muted-foreground text-sm">
								{category === "Favourites"
									? "No favourites yet. Star an effect to keep it here."
									: `No effects match “${query}”.`}
							</p>
						)}
					</>
				)}
				<p className="text-muted-foreground m-0 text-xs leading-relaxed">
					Drag onto a clip, or double-click to add to the selected clips. Drop
					on an empty track to make an adjustment layer that affects everything
					below it.
				</p>
			</div>
		</PanelView>
	);
}

function PresetList({ presets }: { presets: EffectStackPreset[] }) {
	const addToSelection = useAddToSelection();
	const removePreset = useEffectLibrary((s) => s.removePreset);
	if (presets.length === 0) {
		return (
			<p className="text-muted-foreground text-sm leading-relaxed">
				No presets yet. Select a clip with effects, open its Effects tab in
				Properties, and choose “Save stack as preset”.
			</p>
		);
	}
	return (
		<ul className="m-0 flex list-none flex-col gap-2 p-0">
			{presets.map((preset) => (
				<li
					key={preset.id}
					className="bg-card flex items-center gap-2 rounded-lg border p-2.5"
				>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">{preset.name}</div>
						<div className="text-muted-foreground truncate text-xs">
							{preset.effects
								.map((effect) => effectName(effect.type))
								.join(" · ")}
						</div>
					</div>
					<button
						type="button"
						className="bg-accent hover:bg-popover-hover rounded-md border px-2.5 py-1 text-xs font-semibold"
						onClick={() => {
							const count = addToSelection(preset.effects);
							if (count === 0)
								toast.info("Select a video or image clip first.");
							else
								toast.success(
									`Added “${preset.name}” to ${count} clip${count === 1 ? "" : "s"}`,
								);
						}}
					>
						Apply
					</button>
					<button
						type="button"
						aria-label={`Delete preset ${preset.name}`}
						className="text-muted-foreground hover:text-destructive px-1 text-sm"
						onClick={() => removePreset(preset.id)}
					>
						×
					</button>
				</li>
			))}
		</ul>
	);
}

function effectName(type: string): string {
	return effectsRegistry.has(type) ? effectsRegistry.get(type).name : type;
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: {},
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({
	effect,
	isFavourite,
}: {
	effect: EffectDefinition;
	isFavourite: boolean;
}) {
	const editor = useEditor();
	const toggleFavourite = useEffectLibrary((s) => s.toggleFavourite);
	const addToSelection = useAddToSelection();
	const colorSpace = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.colorSpace,
	);
	const sphereProject = useSphereStore((s) => {
		const id = editor.project.getActiveOrNull()?.metadata.id;
		return id ? !!s.sphereProjects[id] : false;
	});
	const hdrReason = hdrUnsupportedReason({
		effectType: effect.type,
		colorSpace,
	});
	const hdrBlocked = hdrReason
		? `Not available in HDR projects. ${hdrReason}`
		: sphereProject && effect.sphereSafe === false
			? "Not available in 360° projects: it's built around the frame's centre or edges, which a sphere doesn't have."
			: null;

	const handleAddToTimeline = () => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	};

	return (
		<div
			className={cn("relative", hdrBlocked && "cursor-not-allowed opacity-40")}
			title={hdrBlocked ?? undefined}
			aria-disabled={hdrBlocked ? true : undefined}
			data-hdr-blocked={hdrBlocked ? effect.type : undefined}
			onDoubleClick={() => {
				if (hdrBlocked) return;
				const count = addToSelection([{ type: effect.type }]);
				if (count === 0)
					toast.info("Select a video or image clip to add the effect to.");
				else
					toast.success(
						`${effect.name} added to ${count} clip${count === 1 ? "" : "s"}`,
					);
			}}
		>
			<div className={cn(hdrBlocked && "pointer-events-none")}>
				<DraggableItem
					name={effect.name}
					preview={<EffectPreviewCanvas effectType={effect.type} />}
					dragData={{
						id: effect.type,
						name: effect.name,
						type: "effect",
						effectType: effect.type,
						targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
					}}
					onAddToTimeline={handleAddToTimeline}
					aspectRatio={1}
					isRounded
					variant="card"
					containerClassName="w-full"
				/>
			</div>
			<button
				type="button"
				aria-label={
					isFavourite
						? `Remove ${effect.name} from favourites`
						: `Add ${effect.name} to favourites`
				}
				aria-pressed={isFavourite}
				onClick={(event) => {
					event.stopPropagation();
					toggleFavourite(effect.type);
				}}
				onDoubleClick={(event) => event.stopPropagation()}
				className={cn(
					"absolute top-1 left-1 flex size-6 items-center justify-center rounded-md bg-black/50 text-sm",
					isFavourite ? "text-caution" : "text-white/70 hover:text-white",
				)}
			>
				{isFavourite ? "★" : "☆"}
			</button>
		</div>
	);
}
