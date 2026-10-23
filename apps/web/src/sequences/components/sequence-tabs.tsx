"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { createSequence, SEQUENCE_SHAPES, shapeLabel } from "../service";

/** Sequence tabs (ED-18): each output of the project, with its shape. */
export function SequenceTabs() {
	const editor = useEditor();
	const scenes = useEditor((e) => e.scenes.getScenes());
	const activeId = useEditor((e) => e.scenes.getActiveSceneOrNull()?.id);
	const projectSize = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.canvasSize,
	);
	const tabs = useMemo(
		() =>
			scenes.map((s) => ({
				id: s.id,
				name: s.name,
				size: s.id === activeId ? projectSize : (s.canvasSize ?? projectSize),
			})),
		[scenes, activeId, projectSize],
	);
	return (
		<div className="flex min-w-0 items-center gap-1" data-sequence-tabs>
			{tabs.length > 1 &&
				tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() =>
							void editor.scenes.switchToScene({ sceneId: tab.id })
						}
						className={cn(
							"flex h-7 max-w-40 items-center gap-1.5 rounded-md border px-2 text-xs",
							tab.id === activeId
								? "border-primary bg-primary/10"
								: "text-muted-foreground hover:bg-accent",
						)}
						title={tab.name}
						data-sequence-tab={tab.id}
						aria-pressed={tab.id === activeId}
					>
						<span className="truncate">{tab.name}</span>
						{tab.size && (
							<span className="text-muted-foreground shrink-0 text-[10px]">
								{shapeLabel(tab.size)}
							</span>
						)}
					</button>
				))}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="hover:bg-accent flex h-7 items-center gap-1 rounded-md border px-2 text-xs"
						title="New sequence: another shape of this edit"
						data-new-sequence
					>
						<Plus className="size-3.5" />
						{tabs.length > 1 ? null : "Sequence"}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuLabel className="text-xs">
						Copy this edit as…
					</DropdownMenuLabel>
					{SEQUENCE_SHAPES.map((shape) => (
						<DropdownMenuItem
							key={shape.id}
							data-sequence-shape={shape.id}
							onSelect={() =>
								void createSequence({ editor, shape })
									.then(() => toast.success(`${shape.label} sequence added`))
									.catch((error: unknown) =>
										toast.error("Couldn't add the sequence", {
											description:
												error instanceof Error ? error.message : String(error),
										}),
									)
							}
						>
							{shape.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
