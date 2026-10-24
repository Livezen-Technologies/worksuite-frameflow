"use client";

import { toast } from "sonner";
import { packContent } from "@/asset-library/registry";
import { useEditor } from "@/editor/use-editor";
import { InputModeButton } from "@/input-method/components/input-mode-button";
import { TEMPLATE_FONTS } from "@/text/templates";
import type { TextElement } from "@/timeline";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TICKS_PER_SECOND } from "@/wasm";
import { applyToCaptionTrack } from "../captions";
import { exportTextClip } from "@/lottie/io/export-actions";
import { frameRateToFloat } from "@/fps/utils";
import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import type { TextStyleOverrides } from "../element-style";
import { usePresetStore } from "../preset-store";
import { applyPresetToClips, presetStyleParams } from "../presets";
import type { TextAnimation } from "../types";
import { TextAnimationEditor } from "./text-animation-editor";

const BUNDLED_FONTS = ["Inter", "Noto Sans Sinhala", "Noto Sans Tamil", "Arial", "Georgia"];

/**
 * Properties → Animate for a text or caption clip. Slider drags preview
 * through the timeline's preview overlay and commit as one undo step on
 * release; everything else is a single undoable update.
 */
export function TextAnimationTab({ element, trackId }: { element: TextElement; trackId: string }) {
	const editor = useEditor();
	const playheadTicks = useEditor((e) => e.playback.getCurrentTime());
	const { selectedElements } = useElementSelection();
	const presets = usePresetStore((s) => s.presets);
	const savePreset = usePresetStore((s) => s.save);
	const removePreset = usePresetStore((s) => s.remove);

	const write = (patch: Partial<TextElement>, commit: boolean) => {
		const ref = { trackId, elementId: element.id };
		if (!commit) {
			editor.timeline.previewElements({ updates: [{ ...ref, updates: patch }] });
			return;
		}
		if (editor.timeline.isPreviewActive()) {
			editor.timeline.previewElements({ updates: [{ ...ref, updates: patch }] });
			editor.timeline.commitPreview();
		} else editor.timeline.updateElements({ updates: [{ ...ref, patch }] });
	};

	const selectedText = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter((x): x is typeof x & { element: TextElement } => x.element.type === "text");

	const track = editor.timeline.getElementsWithTracks({ elements: [{ trackId, elementId: element.id }] })[0]?.track;
	const captions = (track?.elements ?? []).filter((el): el is TextElement => el.type === "text" && (!!el.captionAnchor || !!el.words?.length));
	const fonts = [...new Set([...BUNDLED_FONTS, ...TEMPLATE_FONTS, ...packContent("fonts").map((f) => f.name)])];

	return (
		<div>
			<TextAnimationEditor
				params={element.params as Record<string, unknown>}
				onParams={(patch, commit) => write({ params: { ...element.params, ...patch } as TextElement["params"] }, commit)}
				animation={element.textAnimation}
				onAnimation={(textAnimation: TextAnimation | undefined, commit) => write({ textAnimation }, commit)}
				textStyle={element.textStyle}
				onTextStyle={(textStyle: TextStyleOverrides | undefined, commit) => write({ textStyle }, commit)}
				fonts={fonts}
				playhead={Math.max(0, (Number(playheadTicks) - Number(element.startTime)) / TICKS_PER_SECOND)}
				duration={Number(element.duration) / TICKS_PER_SECOND}
				presets={presets}
				selectionCount={selectedText.length}
				onSavePreset={(name) => {
					if (!element.textAnimation) return;
					savePreset({ name, animation: element.textAnimation, params: presetStyleParams(element.params as Record<string, unknown>), ...(element.textStyle ? { textStyle: element.textStyle } : {}) });
					toast.success(`Saved “${name}”`);
				}}
				onApplyPreset={(preset, all) => {
					const targets = (all && selectedText.length ? selectedText : [{ track: { id: trackId }, element }]).map((x) => ({ trackId: x.track.id, elementId: x.element.id, params: x.element.params as Record<string, unknown> }));
					applyPresetToClips({ editor: editor as unknown as Parameters<typeof applyPresetToClips>[0]["editor"], preset, targets });
				}}
				onDeletePreset={removePreset}
				inputModeSlot={<InputModeButton />}
			/>
			<div className="flex flex-col gap-1.5 px-3 pb-3">
				<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">Export</p>
				<div className="grid grid-cols-2 gap-1.5">
					{(["json", "lottie"] as const).map((format) => (
						<button
							key={format}
							type="button"
							className="rounded border px-2 py-1.5 text-xs"
							data-export-text={format}
							onClick={() => {
								const project = editor.project.getActive();
								const frame = project.settings.canvasSize;
								exportTextClip({
									text: String(element.params.content ?? ""),
									params: element.params as Record<string, unknown>,
									animation: element.textAnimation,
									textStyle: element.textStyle,
									duration: Number(element.duration) / TICKS_PER_SECOND,
									fps: Math.round(frameRateToFloat(project.settings.fps)),
									frame,
									fontSizePx: (Number(element.params.fontSize ?? 15) * frame.height) / FONT_SIZE_SCALE_REFERENCE,
									format,
									name: element.name || "text",
								})
									.then((json) => toast.success(json.meta && (json.meta as { textExport?: string }).textExport === "images" ? "Exported as engine-drawn frames (exact look, any script)" : "Exported as Lottie text layers"))
									.catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Export failed"));
							}}
						>
							{format === "json" ? "Lottie JSON" : "dotLottie"}
						</button>
					))}
				</div>
			</div>
			{captions.length > 1 && element.textAnimation && (
				<div className="px-3 pb-4">
					<button
						type="button"
						className="w-full rounded border px-2 py-1.5 text-xs"
						onClick={() => {
							const patches = applyToCaptionTrack({ elements: captions as Array<TextElement & { params: Record<string, unknown> }>, animation: element.textAnimation! });
							editor.timeline.updateElements({ updates: patches.map((p) => ({ trackId, elementId: p.elementId, patch: { textAnimation: p.textAnimation } })) });
							toast.success(`Animated ${patches.length} captions (word timings used where present)`);
						}}
					>
						Apply to all {captions.length} captions on this track
					</button>
				</div>
			)}
		</div>
	);
}
