"use client";

import {
	ChevronDown,
	Crop,
	ImagePlus,
	Layers,
	Maximize,
	MoreHorizontal,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { type ClipRef, toggleFitFill } from "../actions";
import { PreviewClipMenuItems, useClipMenuActions } from "./clip-menus";

function ToolButton({
	label,
	onClick,
	children,
	className,
}: {
	label: string;
	onClick?: () => void;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			onPointerDown={(e) => e.stopPropagation()}
			className={cn(
				"hover:bg-accent flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-md px-1.5",
				className,
			)}
		>
			{children}
		</button>
	);
}

/**
 * Floating toolbar over the selected clip in the preview: replace, fit or
 * fill, crop, overlay track, and the full clip menu behind "…".
 */
export function ClipToolbar({
	clip,
	x,
	y,
}: {
	clip: ClipRef;
	/** Overlay pixel position of the toolbar's centre-bottom. */
	x: number;
	y: number;
}) {
	const editor = useEditor();
	const a = useClipMenuActions(clip);
	return (
		<div
			className="bg-popover text-popover-foreground pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-xl border p-1 shadow-lg"
			style={{ left: x, top: Math.max(44, y - 10) }}
			data-clip-toolbar
		>
			{a.canReplace && (
				<ToolButton label="Replace" onClick={a.replace}>
					<ImagePlus className="size-4" />
				</ToolButton>
			)}
			{a.isVisual && (
				<ToolButton
					label="Fit / fill the frame"
					onClick={() => toggleFitFill({ editor, clip })}
				>
					<Maximize className="size-4" />
				</ToolButton>
			)}
			{a.canCrop && (
				<ToolButton label="Crop" onClick={a.crop}>
					<Crop className="size-4" />
				</ToolButton>
			)}
			{a.isVisual && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Overlay"
							title="Overlay"
							onPointerDown={(e) => e.stopPropagation()}
							className="hover:bg-accent flex h-8 items-center gap-0.5 rounded-md px-1.5"
						>
							<Layers className="size-4" />
							<ChevronDown className="text-muted-foreground size-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
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
						<DropdownMenuItem onClick={a.addOverlay}>
							Add overlay…
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			<span className="bg-border mx-0.5 h-5 w-px" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="More"
						onPointerDown={(e) => e.stopPropagation()}
						className="bg-accent/60 hover:bg-accent flex size-8 items-center justify-center rounded-md"
						data-clip-more
					>
						<MoreHorizontal className="size-4" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-60">
					<PreviewClipMenuItems clip={clip} />
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
