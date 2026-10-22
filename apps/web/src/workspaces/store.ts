"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	BUILT_IN_WORKSPACES,
	DEFAULT_WORKSPACE_ID,
	type Workspace,
	type WorkspaceLayout,
} from "./presets";

interface ApplyRequest extends WorkspaceLayout {
	nonce: number;
}

interface WorkspaceStore {
	activeId: string;
	/** Workspaces the user saved. */
	custom: Workspace[];
	/** Each workspace's last layout, so a switch back restores the user's tweaks. */
	layouts: Record<string, WorkspaceLayout>;
	/** The editor applies this whenever its nonce changes. */
	apply: ApplyRequest | null;
	switchTo: (args: { id: string; current: WorkspaceLayout }) => void;
	saveAs: (args: { name: string; current: WorkspaceLayout }) => Workspace;
	rename: (args: { id: string; name: string }) => void;
	remove: (args: { id: string }) => void;
	reset: (args: { id: string }) => void;
}

export function allWorkspaces(custom: Workspace[]): Workspace[] {
	return [...BUILT_IN_WORKSPACES, ...custom];
}

function findWorkspace({
	custom,
	id,
}: {
	custom: Workspace[];
	id: string;
}): Workspace | undefined {
	return allWorkspaces(custom).find((workspace) => workspace.id === id);
}

let nonce = 0;
const request = (layout: WorkspaceLayout): ApplyRequest => ({
	...layout,
	nonce: ++nonce,
});

export const useWorkspaceStore = create<WorkspaceStore>()(
	persist(
		(set, get) => ({
			activeId: DEFAULT_WORKSPACE_ID,
			custom: [],
			layouts: {},
			apply: null,
			switchTo: ({ id, current }) => {
				const { activeId, custom, layouts } = get();
				const target = findWorkspace({ custom, id });
				if (!target) return;
				if (id === activeId) {
					// Clicking the active workspace brings back its tool tab
					// without touching the panel sizes.
					set({
						apply: request({
							panels: current.panels,
							tab: (layouts[id] ?? target).tab,
						}),
					});
					return;
				}
				const saved = { ...layouts, [activeId]: current };
				set({
					activeId: id,
					layouts: saved,
					apply: request(saved[id] ?? target),
				});
			},
			saveAs: ({ name, current }) => {
				const workspace: Workspace = {
					id: `custom-${Date.now().toString(36)}`,
					name: name.trim() || "My workspace",
					builtIn: false,
					description: "Your saved layout.",
					...current,
				};
				set((state) => ({
					custom: [...state.custom, workspace],
					activeId: workspace.id,
					layouts: { ...state.layouts, [state.activeId]: current },
				}));
				return workspace;
			},
			rename: ({ id, name }) =>
				set((state) => ({
					custom: state.custom.map((w) =>
						w.id === id ? { ...w, name: name.trim() || w.name } : w,
					),
				})),
			remove: ({ id }) => {
				const { custom, layouts, activeId } = get();
				const { [id]: _removed, ...rest } = layouts;
				const next = custom.filter((w) => w.id !== id);
				if (activeId !== id) {
					set({ custom: next, layouts: rest });
					return;
				}
				const fallback = findWorkspace({
					custom: next,
					id: DEFAULT_WORKSPACE_ID,
				})!;
				set({
					custom: next,
					layouts: rest,
					activeId: fallback.id,
					apply: request(rest[fallback.id] ?? fallback),
				});
			},
			reset: ({ id }) => {
				const { custom, layouts, activeId } = get();
				const workspace = findWorkspace({ custom, id });
				if (!workspace) return;
				const { [id]: _dropped, ...rest } = layouts;
				set({
					layouts: rest,
					...(id === activeId ? { apply: request(workspace) } : {}),
				});
			},
		}),
		{
			name: "frameflow-workspaces",
			partialize: ({ activeId, custom, layouts }) => ({
				activeId,
				custom,
				layouts,
			}),
		},
	),
);
