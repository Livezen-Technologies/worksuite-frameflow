/**
 * Project tabs (SRS MP-01–MP-11): pure helpers for the open-tab list.
 */
export interface ProjectTab {
	id: string;
	name: string;
}

export const SOFT_TAB_LIMIT = 8;

export function openTab({
	tabs,
	tab,
}: {
	tabs: ProjectTab[];
	tab: ProjectTab;
}): ProjectTab[] {
	// The same project is never open twice (MP-08): refresh its name.
	if (tabs.some((t) => t.id === tab.id))
		return tabs.map((t) => (t.id === tab.id ? { ...t, name: tab.name } : t));
	return [...tabs, tab];
}

/** Removes a tab and says which one should be shown next. */
export function closeTab({
	tabs,
	id,
	activeId,
}: {
	tabs: ProjectTab[];
	id: string;
	activeId: string | null;
}): { tabs: ProjectTab[]; nextId: string | null } {
	const index = tabs.findIndex((t) => t.id === id);
	if (index < 0) return { tabs, nextId: activeId };
	const rest = tabs.filter((t) => t.id !== id);
	if (activeId !== id) return { tabs: rest, nextId: activeId };
	const next = rest[Math.min(index, rest.length - 1)] ?? null;
	return { tabs: rest, nextId: next?.id ?? null };
}

export function moveTab({
	tabs,
	from,
	to,
}: {
	tabs: ProjectTab[];
	from: number;
	to: number;
}): ProjectTab[] {
	if (from === to || from < 0 || from >= tabs.length) return tabs;
	const next = [...tabs];
	const [tab] = next.splice(from, 1);
	if (!tab) return tabs;
	next.splice(Math.max(0, Math.min(to, next.length)), 0, tab);
	return next;
}

/** Ctrl+Tab / Ctrl+Shift+Tab. */
export function cycleTab({
	tabs,
	activeId,
	step,
}: {
	tabs: ProjectTab[];
	activeId: string | null;
	step: 1 | -1;
}): string | null {
	if (tabs.length === 0) return null;
	const index = Math.max(
		0,
		tabs.findIndex((t) => t.id === activeId),
	);
	return tabs[(index + step + tabs.length) % tabs.length]?.id ?? null;
}

/** Ctrl+1–8 pick that tab; Ctrl+9 the last, as in browsers. */
export function tabForNumber({
	tabs,
	n,
}: {
	tabs: ProjectTab[];
	n: number;
}): string | null {
	if (n === 9) return tabs.at(-1)?.id ?? null;
	return tabs[n - 1]?.id ?? null;
}
