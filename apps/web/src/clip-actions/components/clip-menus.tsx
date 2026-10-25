"use client";

import { useTimelineStore } from "@/timeline/timeline-store";
import type { ReactNode } from "react";
import {
	ClipboardPaste,
	Crop,
	Download,
	Film,
	FlipHorizontal2,
	ImagePlus,
	Layers,
	Pause,
	Replace,
	Scissors,
	ScrollText,
	SplitSquareHorizontal, Gauge } from "lucide-react";
import { toast } from "sonner";
import { invokeAction } from "@/actions";
import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import {
	hasMediaId,
	isMaskableElement,
	isVisualElement,
} from "@/timeline/element-utils";
import {
	addOverlay,
	type ClipRef,
	cutSelected,
	downloadFrame,
	downloadSource,
	flipClip,
	freezeFrame,
	mediaOf,
	moveClipTrack,
	openTranscriptEditing,
	pickFile,
	replaceClipMedia,
	splitScenes,
	startCrop,
} from "../actions";

const isMac =
	typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

const run = ({
	label,
	task,
}: {
	label: string;
	task: () => Promise<unknown>;
}) => {
	task().catch((error) =>
		toast.error(error instanceof Error ? error.message : `${label} failed`),
	);
};

/** Shared menu actions for one clip (timeline and preview menus). */
function useClipMenuActions(clip: ClipRef) {
	const editor = useEditor();
	const { element } = clip;
	const asset = mediaOf({ editor, element });
	return {
		canReplace: hasMediaId(element),
		canCrop: isMaskableElement(element) && isVisualElement(element),
		isVisual: isVisualElement(element),
		isVideo: asset?.type === "video",
		onMain: clip.trackId === editor.scenes.getActiveScene().tracks.main.id,
		cut: () => cutSelected(),
		paste: () => invokeAction("paste-copied"),
		replace: () =>
			run({
				label: "Replace",
				task: async () => {
					const accept =
						asset?.type === "audio" ? "audio/*" : "image/*,video/*";
					const file = await pickFile(accept);
					if (file) await replaceClipMedia({ editor, clip, file });
				},
			}),
		crop: () => startCrop({ editor, clip }),
		flip: (axis: "horizontal" | "vertical") => flipClip({ editor, clip, axis }),
		overlay: (to: "overlay" | "main") => moveClipTrack({ editor, clip, to }),
		addOverlay: () =>
			run({ label: "Add overlay", task: () => addOverlay({ editor }) }),
		downloadSource: () => downloadSource({ editor, clip }),
		downloadFrame: () =>
			run({ label: "Download", task: () => downloadFrame({ editor, clip }) }),
		transcript: () => openTranscriptEditing(),
		splitScene: () =>
			run({
				label: "Split scene",
				task: async () => {
					const id = toast.loading("Looking for scene changes…");
					const count = await splitScenes({ editor, clip }).finally(() =>
						toast.dismiss(id),
					);
					if (count === 0) toast.info("No scene changes found in this clip.");
					else toast.success(`Split into ${count + 1} scenes`);
				},
			}),
		freeze: () =>
			run({ label: "Freeze", task: () => freezeFrame({ editor, clip }) }),
	};
}

/** Extra items for the timeline clip menu (right-click). */
export function TimelineClipMenuExtras({
	clip,
	section,
}: {
	clip: ClipRef;
	section: "edit" | "tools";
}) {
	const a = useClipMenuActions(clip);
	if (section === "edit") {
		return (
			<>
				<ContextMenuItem
					icon={<Scissors />}
					textRight={`${mod}X`}
					onClick={a.cut}
				>
					Cut
				</ContextMenuItem>
				<ContextMenuItem
					icon={<ClipboardPaste />}
					textRight={`${mod}V`}
					onClick={a.paste}
				>
					Paste
				</ContextMenuItem>
			</>
		);
	}
	return (
		<>
			<ContextMenuSeparator />
			<ContextMenuItem
				icon={<Gauge />}
				onClick={() => {
					const store = useTimelineStore.getState();
					if (!store.speedCurvesVisible) store.toggleSpeedCurves();
				}}
				data-clip-speed-curve
			>
				Speed curve
			</ContextMenuItem>
			{a.canReplace && (
				<ContextMenuItem
					icon={<Replace />}
					onClick={a.replace}
					data-clip-replace
				>
					Replace
				</ContextMenuItem>
			)}
			{a.canReplace && (
				<ContextMenuSub>
					<ContextMenuSubTrigger icon={<Download />}>
						Download clip
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem onClick={a.downloadSource}>
							Original file
						</ContextMenuItem>
						{a.isVisual && (
							<ContextMenuItem onClick={a.downloadFrame}>
								Frame at playhead (PNG)
							</ContextMenuItem>
						)}
					</ContextMenuSubContent>
				</ContextMenuSub>
			)}
			<ContextMenuItem icon={<ScrollText />} onClick={a.transcript}>
				Transcript-based editing
			</ContextMenuItem>
			{a.isVideo && (
				<ContextMenuItem
					icon={<SplitSquareHorizontal />}
					onClick={a.splitScene}
					data-clip-split-scene
				>
					Split scene
				</ContextMenuItem>
			)}
			{a.isVisual && a.canReplace && (
				<ContextMenuItem icon={<Pause />} onClick={a.freeze} data-clip-freeze>
					Freeze
				</ContextMenuItem>
			)}
		</>
	);
}

function Shortcut({ children }: { children: ReactNode }) {
	return <DropdownMenuShortcut>{children}</DropdownMenuShortcut>;
}

/** The preview toolbar's "…" menu. */
export function PreviewClipMenuItems({ clip }: { clip: ClipRef }) {
	const a = useClipMenuActions(clip);
	return (
		<>
			<DropdownMenuItem
				icon={<Film />}
				onClick={() => invokeAction("copy-selected")}
			>
				Copy <Shortcut>{mod}C</Shortcut>
			</DropdownMenuItem>
			<DropdownMenuItem icon={<Scissors />} onClick={a.cut}>
				Cut <Shortcut>{mod}X</Shortcut>
			</DropdownMenuItem>
			<DropdownMenuItem icon={<ClipboardPaste />} onClick={a.paste}>
				Paste <Shortcut>{mod}V</Shortcut>
			</DropdownMenuItem>
			<DropdownMenuItem
				icon={<Layers />}
				onClick={() => invokeAction("duplicate-selected")}
			>
				Duplicate <Shortcut>{mod}D</Shortcut>
			</DropdownMenuItem>
			<DropdownMenuItem
				icon={<Scissors className="opacity-0" />}
				variant="destructive"
				onClick={() => invokeAction("delete-selected")}
			>
				Delete <Shortcut>⌫</Shortcut>
			</DropdownMenuItem>
			{a.canReplace && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem icon={<Replace />} onClick={a.replace}>
						Replace
					</DropdownMenuItem>
				</>
			)}
			{a.isVisual && (
				<>
					<DropdownMenuSeparator />
					{a.canCrop && (
						<DropdownMenuItem icon={<Crop />} onClick={a.crop}>
							Crop
						</DropdownMenuItem>
					)}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<FlipHorizontal2 className="mr-2 size-4" /> Flip
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem onClick={() => a.flip("horizontal")}>
								Horizontal
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => a.flip("vertical")}>
								Vertical
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Layers className="mr-2 size-4" /> Overlay
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								disabled={!a.onMain}
								onClick={() => a.overlay("overlay")}
							>
								Move to an overlay track
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={a.onMain}
								onClick={() => a.overlay("main")}
							>
								Move to the main track
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuItem icon={<ImagePlus />} onClick={a.addOverlay}>
						Add overlay
					</DropdownMenuItem>
				</>
			)}
		</>
	);
}

export { useClipMenuActions };
