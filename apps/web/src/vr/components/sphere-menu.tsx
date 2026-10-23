"use client";

import { Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { isVisualElement } from "@/timeline/element-utils";
import { findReframeEffect } from "../projection";
import { useSphereStore } from "../store";

const SIZES = [
	{ width: 3840, height: 1920, label: "4K 360° · 3840×1920" },
	{ width: 5760, height: 2880, label: "5.7K 360° · 5760×2880" },
	{ width: 7680, height: 3840, label: "8K 360° · 7680×3840" },
];

/** Preview toolbar menu: 360° project mode, look-around and guides (VR-15). */
export function SphereMenu() {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActiveOrNull());
	const projectId = project?.metadata.id ?? "";
	const on = useSphereStore((s) => !!s.sphereProjects[projectId]);
	const lookAround = useSphereStore((s) => s.lookAround);
	const guides = useSphereStore((s) => s.guides);
	if (!project) return null;
	const size = project.settings.canvasSize;

	/** Each 360° clip keeps the sphere in a 360° project, or reframes. */
	const setClipModes = (mode: "sphere" | "reframe") => {
		const tracks = editor.scenes.getActiveScene().tracks;
		const updates = [...tracks.overlay, tracks.main].flatMap((track) =>
			track.elements.flatMap((element) => {
				if (!isVisualElement(element)) return [];
				const effect = findReframeEffect(element.effects);
				if (!effect) return [];
				return [
					{
						trackId: track.id,
						elementId: element.id,
						patch: {
							effects: (element.effects ?? []).map((e) =>
								e.id === effect.id
									? { ...e, params: { ...e.params, mode } }
									: e,
							),
						},
					},
				];
			}),
		);
		if (updates.length > 0) editor.timeline.updateElements({ updates });
	};

	const enable = (canvasSize: { width: number; height: number }) => {
		useSphereStore.getState().setSphereProject({ projectId, on: true });
		void editor.project.updateSettings({
			settings: {
				canvasSize,
				canvasSizeMode: "custom",
				lastCustomCanvasSize: canvasSize,
			},
		});
		setClipModes("sphere");
		toast.success("360° project", {
			description:
				"Exports carry 360° metadata for YouTube, Facebook and headsets.",
		});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={on ? "secondary" : "text"}
					size="sm"
					className="h-7 gap-1 px-2 text-xs"
					data-sphere-menu
				>
					<Globe className="size-3.5" />
					360°
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel>
					{on
						? `360° project · ${size.width}×${size.height}`
						: "Make a 360° video"}
				</DropdownMenuLabel>
				{SIZES.map((s) => (
					<DropdownMenuItem
						key={s.width}
						data-sphere-size={s.width}
						onClick={() => enable(s)}
					>
						{s.label}
					</DropdownMenuItem>
				))}
				{on && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuCheckboxItem
							checked={lookAround}
							onCheckedChange={(v) =>
								useSphereStore.getState().setView({ lookAround: !!v })
							}
						>
							Look around in the preview
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={guides}
							onCheckedChange={(v) =>
								useSphereStore.getState().setView({ guides: !!v })
							}
						>
							Horizon and front guides
						</DropdownMenuCheckboxItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								useSphereStore
									.getState()
									.setSphereProject({ projectId, on: false });
								setClipModes("reframe");
							}}
						>
							Back to a flat video
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** Viewer or guides over the preview in a 360° project. */
export function useSphereProjectView() {
	const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id);
	const on = useSphereStore((s) =>
		projectId ? !!s.sphereProjects[projectId] : false,
	);
	const lookAround = useSphereStore((s) => s.lookAround);
	const guides = useSphereStore((s) => s.guides);
	return { lookAround: on && lookAround, guides: on && !lookAround && guides };
}
