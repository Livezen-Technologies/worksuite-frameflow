"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import {
	ATTRIBUTE_GROUPS,
	type AttributeGroup,
	attributePatch,
} from "../paste-attributes";

/** Ctrl/Cmd+Alt+V: paste chosen attributes onto the selected clips (MP-16). */
export function PasteAttributesDialog() {
	const editor = useEditor();
	const [open, setOpen] = useState(false);
	const [groups, setGroups] = useState<Set<AttributeGroup>>(
		new Set(["effects", "grade"]),
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.key.toLowerCase() !== "v")
				return;
			e.preventDefault();
			e.stopPropagation();
			const entry = editor.clipboard.getEntry();
			if (entry?.type !== "elements" || entry.items.length === 0) {
				toast.info(
					"Copy a clip first (Ctrl+C), then select clips and paste its attributes.",
				);
				return;
			}
			if (editor.selection.getSelectedElements().length === 0) {
				toast.info("Select the clips to paste onto.");
				return;
			}
			setOpen(true);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [editor]);

	const apply = () => {
		const entry = editor.clipboard.getEntry();
		const sourceItem = entry?.type === "elements" ? entry.items[0] : undefined;
		if (!sourceItem) return;
		const source = {
			...sourceItem.element,
			id: "clipboard",
		} as TimelineElement;
		const targets = editor.timeline.getElementsWithTracks({
			elements: editor.selection.getSelectedElements(),
		});
		editor.timeline.updateElements({
			updates: targets.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: attributePatch({
					source,
					target: element,
					groups,
					makeId: generateUUID,
				}),
			})),
		});
		toast.success(
			`Pasted onto ${targets.length} clip${targets.length === 1 ? "" : "s"}`,
		);
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-sm" data-paste-attributes>
				<DialogHeader>
					<DialogTitle>Paste attributes</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2 py-2">
					{ATTRIBUTE_GROUPS.map((g) => (
						<label key={g.id} className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={groups.has(g.id)}
								onChange={(e) => {
									const next = new Set(groups);
									if (e.target.checked) next.add(g.id);
									else next.delete(g.id);
									setGroups(next);
								}}
							/>
							{g.label}
						</label>
					))}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={apply} disabled={groups.size === 0}>
						Paste
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
