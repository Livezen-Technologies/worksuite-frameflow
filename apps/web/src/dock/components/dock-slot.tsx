"use client";

import { type ReactNode, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/utils/ui";
import { isDockPanelId, zoneAt, type DockPanelId, type DockRow, type DockSlot, type DockZone } from "../layout";
import { useDockStore } from "../store";
import { useT } from "@/i18n";

export const PANEL_TITLES: Record<DockPanelId, string> = {
	media: "Media",
	preview: "Player",
	properties: "Properties",
	timeline: "Timeline",
};

/** Drag data naming the panel whose title is being dragged. */
const PANEL_TYPE = "application/x-frameflow-panel";

const ZONE_CLASS: Record<DockZone, string> = {
	left: "inset-y-0 left-0 w-1/2",
	right: "inset-y-0 right-0 w-1/2",
	top: "inset-x-0 top-0 h-1/2",
	bottom: "inset-x-0 bottom-0 h-1/2",
	center: "inset-0",
};

/**
 * One dock slot: a thin title strip (tabs when panels share the slot) whose
 * titles drag to re-dock, with close and maximise; the body shows the active
 * panel and, while a panel is dragged over it, where it would dock.
 */
export function DockSlotFrame({
	slot,
	row,
	index,
	render,
}: {
	slot: DockSlot;
	row: DockRow;
	index: number;
	render: (id: DockPanelId) => ReactNode;
}) {
	const { dock, close, show, toggleMaximized, maximized } = useDockStore();
	const [zone, setZone] = useState<DockZone | null>(null);
	const t = useT();

	const zoneFor = (e: React.DragEvent<HTMLElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		return zoneAt({ x: e.clientX - box.left, y: e.clientY - box.top, width: box.width, height: box.height });
	};

	return (
		<div className="flex size-full min-h-0 min-w-0 flex-col" data-dock-slot={`${row}-${index}`}>
			<div className="flex h-6 shrink-0 items-center gap-0.5 px-1 text-[11px]" role="tablist">
				{slot.panels.map((id) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={slot.active === id}
						draggable
						title="Drag to dock this panel somewhere else"
						onClick={() => show(id)}
						onDragStart={(e) => {
							e.dataTransfer.setData(PANEL_TYPE, id);
							e.dataTransfer.effectAllowed = "move";
						}}
						className={cn(
							"cursor-grab rounded px-2 py-0.5 font-medium",
							slot.active === id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
						)}
						data-dock-title={id}
					>
						{t(PANEL_TITLES[id])}
					</button>
				))}
				<span className="flex-1" />
				<button
					type="button"
					aria-label={maximized ? "Restore panels" : `Maximise ${PANEL_TITLES[slot.active]}`}
					title={maximized ? "Restore (`)" : "Maximise (`)"}
					className="text-muted-foreground hover:text-foreground rounded p-0.5"
					onClick={() => toggleMaximized(slot.active)}
					data-dock-maximize={slot.active}
				>
					{maximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
				</button>
				{!maximized && (
					<button
						type="button"
						aria-label={`Close ${PANEL_TITLES[slot.active]}`}
						title="Close (reopen from Workspace options → Panels)"
						className="text-muted-foreground hover:text-foreground rounded p-0.5"
						onClick={() => close(slot.active)}
						data-dock-close={slot.active}
					>
						<X className="size-3" />
					</button>
				)}
			</div>
			<div
				className="relative min-h-0 flex-1"
				onDragOver={(e) => {
					if (maximized || !e.dataTransfer.types.includes(PANEL_TYPE)) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					setZone(zoneFor(e));
				}}
				onDragLeave={(e) => {
					const to = e.relatedTarget;
					if (!(to instanceof Node && e.currentTarget.contains(to))) setZone(null);
				}}
				onDrop={(e) => {
					const id = e.dataTransfer.getData(PANEL_TYPE);
					setZone(null);
					if (!isDockPanelId(id)) return;
					e.preventDefault();
					dock({ id, target: { row, index }, zone: zoneFor(e) });
				}}
			>
				{render(slot.active)}
				{zone && (
					<div
						className={cn("bg-primary/25 border-primary pointer-events-none absolute z-50 rounded-md border-2", ZONE_CLASS[zone])}
						data-dock-zone={zone}
					/>
				)}
			</div>
		</div>
	);
}
