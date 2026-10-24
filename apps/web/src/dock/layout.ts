/**
 * Dockable editor panels (SRS WS-03 in part, WS layout rows): the editor is
 * two rows of slots; each slot holds one or more panels shown as tabs.
 * Dragging a panel's title onto another slot docks it beside that slot
 * (left/right), into the other row (top/bottom) or as a tab (centre).
 */

export type DockPanelId = "media" | "preview" | "properties" | "timeline";
export const DOCK_PANELS: DockPanelId[] = ["media", "preview", "properties", "timeline"];

export function isDockPanelId(value: unknown): value is DockPanelId {
	return DOCK_PANELS.some((p) => p === value);
}

export interface DockSlot {
	panels: DockPanelId[];
	active: DockPanelId;
}

export interface DockLayout {
	top: DockSlot[];
	bottom: DockSlot[];
	/** Closed panels, reopened from the Window menu. */
	hidden: DockPanelId[];
}

export type DockRow = "top" | "bottom";
export type DockZone = "left" | "right" | "top" | "bottom" | "center";

const slot = (id: DockPanelId): DockSlot => ({ panels: [id], active: id });

export const DEFAULT_DOCK: DockLayout = {
	top: [slot("media"), slot("preview"), slot("properties")],
	bottom: [slot("timeline")],
	hidden: [],
};

export function isDefaultDock(layout: DockLayout): boolean {
	return JSON.stringify(layout) === JSON.stringify(DEFAULT_DOCK);
}

/** Where a panel is, if it is shown. */
export function findPanel({ layout, id }: { layout: DockLayout; id: DockPanelId }) {
	for (const row of ["top", "bottom"] as const) {
		const index = layout[row].findIndex((s) => s.panels.includes(id));
		if (index >= 0) return { row, index };
	}
	return null;
}

function without({ layout, id }: { layout: DockLayout; id: DockPanelId }): DockLayout {
	const strip = (slots: DockSlot[]) =>
		slots
			.map((s) => {
				const panels = s.panels.filter((p) => p !== id);
				return { panels, active: s.active === id ? panels[0] : s.active };
			})
			.filter((s): s is DockSlot => s.panels.length > 0 && !!s.active);
	return { ...layout, top: strip(layout.top), bottom: strip(layout.bottom) };
}

/** Docks a panel against a slot. Unknown targets leave the layout unchanged. */
export function dockPanel({
	layout,
	id,
	target,
	zone,
}: {
	layout: DockLayout;
	id: DockPanelId;
	target: { row: DockRow; index: number };
	zone: DockZone;
}): DockLayout {
	const targetSlot = layout[target.row][target.index];
	if (!targetSlot) return layout;
	// Dropping a lone panel on itself does nothing.
	if (targetSlot.panels.length === 1 && targetSlot.panels[0] === id) return layout;
	const anchor = targetSlot.panels[0];
	const next = without({ layout, id });
	next.hidden = next.hidden.filter((p) => p !== id);
	// The target may have moved when the panel left; find it again by its first panel.
	const found = findPanel({ layout: next, id: anchor === id ? targetSlot.panels[1] : anchor });
	if (!found) return layout;
	const row = [...next[found.row]];
	if (zone === "center") {
		const s = row[found.index];
		row[found.index] = { panels: [...s.panels, id], active: id };
		return { ...next, [found.row]: row };
	}
	if (zone === "left" || zone === "right") {
		row.splice(found.index + (zone === "right" ? 1 : 0), 0, slot(id));
		return { ...next, [found.row]: row };
	}
	// Top/bottom: into the other row at about the same place; with no row on
	// that side (top of the top row, bottom of the bottom row), beside it.
	const other: DockRow = zone === "top" ? "top" : "bottom";
	if (other === found.row) {
		row.splice(found.index + (zone === "bottom" ? 1 : 0), 0, slot(id));
		return { ...next, [found.row]: row };
	}
	const into = [...next[other]];
	into.splice(Math.min(found.index, into.length), 0, slot(id));
	return { ...next, [other]: into };
}

export function closePanel({ layout, id }: { layout: DockLayout; id: DockPanelId }): DockLayout {
	if (!findPanel({ layout, id })) return layout;
	const next = without({ layout, id });
	// Keep at least one panel on screen.
	if (!next.top.length && !next.bottom.length) return layout;
	return { ...next, hidden: [...next.hidden, id] };
}

/** Reopens a closed panel where it sits by default: preview/media/properties on top, timeline below. */
export function reopenPanel({ layout, id }: { layout: DockLayout; id: DockPanelId }): DockLayout {
	if (findPanel({ layout, id })) return layout;
	const row: DockRow = id === "timeline" ? "bottom" : "top";
	const slots = [...layout[row]];
	const order = DEFAULT_DOCK[row].map((s) => s.active);
	const at = slots.filter((s) => order.indexOf(s.panels[0]) < order.indexOf(id) && order.includes(s.panels[0])).length;
	slots.splice(at, 0, slot(id));
	return { ...layout, [row]: slots, hidden: layout.hidden.filter((p) => p !== id) };
}

export function showTab({ layout, id }: { layout: DockLayout; id: DockPanelId }): DockLayout {
	const at = findPanel({ layout, id });
	if (!at) return layout;
	const row = [...layout[at.row]];
	row[at.index] = { ...row[at.index], active: id };
	return { ...layout, [at.row]: row };
}

/** Which zone of a slot a point falls in: outer quarters dock beside, the middle as a tab. */
export function zoneAt({ x, y, width, height }: { x: number; y: number; width: number; height: number }): DockZone {
	const fx = x / width;
	const fy = y / height;
	const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
	if (edge > 0.25) return "center";
	if (edge === fx) return "left";
	if (edge === 1 - fx) return "right";
	return edge === fy ? "top" : "bottom";
}

/** A stored layout from an older or broken save becomes a valid one. */
export function sanitizeDock(value: unknown): DockLayout {
	if (!value || typeof value !== "object") return DEFAULT_DOCK;
	const v = value as Partial<DockLayout>;
	const seen = new Set<DockPanelId>();
	const clean = (slots: unknown): DockSlot[] =>
		(Array.isArray(slots) ? slots : [])
			.map((s: Partial<DockSlot>) => {
				const panels = (Array.isArray(s?.panels) ? s.panels : []).filter(
					(p): p is DockPanelId => isDockPanelId(p) && !seen.has(p) && !!seen.add(p),
				);
				const active = panels.find((p) => p === s?.active) ?? panels[0];
				return { panels, active };
			})
			.filter((s): s is DockSlot => s.panels.length > 0 && !!s.active);
	const top = clean(v.top);
	const bottom = clean(v.bottom);
	const hidden = DOCK_PANELS.filter((p) => !seen.has(p));
	if (!top.length && !bottom.length) return DEFAULT_DOCK;
	return { top, bottom, hidden };
}
