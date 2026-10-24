"use client";

import { useState, type ReactElement } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { iconLayers, searchIcons } from "../icons";
import { useStudio } from "../store";

/** Searchable icon grid; a click adds the icon as editable path layers. */
export function IconPicker({ trigger }: { trigger: ReactElement }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [color, setColor] = useState("#FFFFFF");
	const icons = searchIcons({ query });
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className="w-80 p-2" align="start" data-icon-picker>
				<div className="mb-2 flex gap-2">
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search icons"
						className="bg-muted/50 h-8 min-w-0 flex-1 border px-2 text-sm"
						data-icon-search
					/>
					<input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-8 w-9 border bg-transparent" aria-label="Icon colour" />
				</div>
				<div className="grid max-h-72 grid-cols-5 gap-1 overflow-y-auto">
					{icons.map((icon) => (
						<button
							key={icon.id}
							type="button"
							title={icon.name}
							data-icon={icon.id}
							className="hover:bg-accent flex aspect-square items-center justify-center border"
							onClick={() => {
								const s = useStudio.getState();
								const project = s.project;
								if (!project) return;
								const { layers, groupId } = iconLayers({ icon, project, color });
								s.commit((p) => ({
									...p,
									layers: [...p.layers, ...layers],
									groups: groupId ? [...p.groups, { id: groupId, name: icon.name, collapsed: true }] : p.groups,
								}));
								s.select(layers.map((l) => l.id));
								setOpen(false);
							}}
						>
							<svg viewBox="-4 -4 108 108" className="size-8">
								<path
									d={icon.d}
									fill={icon.stroke ? "none" : "currentColor"}
									stroke={icon.stroke ? "currentColor" : "none"}
									strokeWidth={icon.stroke ? 10 : 0}
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					))}
					{!icons.length && <p className="text-muted-foreground col-span-5 py-4 text-center text-xs">No icons match.</p>}
				</div>
			</PopoverContent>
		</Popover>
	);
}
