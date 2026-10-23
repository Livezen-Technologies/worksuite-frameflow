"use client";

import { LayoutPanelTop } from "lucide-react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { applyPresenterLayout } from "../apply";
import { PRESENTER_LAYOUTS } from "../presenter";

/** Presenter layouts for a screen recording + camera (ED-19). */
export function LayoutMenu() {
	const editor = useEditor();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="hover:bg-accent flex h-7 items-center gap-1 rounded-md border px-2 text-xs"
					title="Presenter layouts: select the screen and camera clips"
					data-layout-menu
				>
					<LayoutPanelTop className="size-3.5" />
					Layout
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuLabel className="text-xs">
					Screen + presenter (select both clips)
				</DropdownMenuLabel>
				{PRESENTER_LAYOUTS.map((layout) => (
					<DropdownMenuItem
						key={layout.id}
						data-layout={layout.id}
						onSelect={() => {
							const result = applyPresenterLayout({ editor, layout: layout.id });
							if (!result.ok) toast.info(result.message);
						}}
					>
						{layout.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
