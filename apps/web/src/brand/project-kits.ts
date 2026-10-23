"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type BrandKit, useBrandKit } from "./store";

/**
 * Per-project brand kits (SRS PS-20). The Brand kit panel always edits
 * `useBrandKit`; this keeps a copy for each project that has its own kit
 * plus the shared kit, and swaps the right one in when the project changes.
 */
interface ProjectKitsStore {
	byProject: Record<string, BrandKit>;
	shared: BrandKit | null;
}

export const useProjectKits = create<ProjectKitsStore>()(
	persist((): ProjectKitsStore => ({ byProject: {}, shared: null }), { name: "frameflow-project-brand-kits" }),
);

export function kitData(kit: BrandKit): BrandKit {
	const { name, colors, headingFont, bodyFont, logos, watermark } = kit;
	return { name, colors, headingFont, bodyFont, logos, watermark };
}

let activeProject: string | null = null;
let applying = false;

/** Call when the open project changes: loads its kit or the shared one. */
export function switchBrandKit({ projectId }: { projectId: string | null }) {
	if (projectId === activeProject) return;
	const kits = useProjectKits.getState();
	if (!kits.shared) useProjectKits.setState({ shared: kitData(useBrandKit.getState()) });
	activeProject = projectId;
	const next = (projectId && kits.byProject[projectId]) || useProjectKits.getState().shared;
	if (!next) return;
	applying = true;
	useBrandKit.setState(next);
	applying = false;
}

/** Edits in the panel land in the open project's kit, or the shared one. */
useBrandKit.subscribe((state) => {
	if (applying) return;
	const data = kitData(state);
	const { byProject } = useProjectKits.getState();
	if (activeProject && byProject[activeProject])
		useProjectKits.setState({ byProject: { ...byProject, [activeProject]: data } });
	else useProjectKits.setState({ shared: data });
});

export function hasOwnKit({ projectId }: { projectId: string }): boolean {
	return !!useProjectKits.getState().byProject[projectId];
}

/** Gives the project its own copy of the current kit, or goes back to the shared one. */
export function setOwnKit({ projectId, own }: { projectId: string; own: boolean }) {
	const { byProject, shared } = useProjectKits.getState();
	if (own) {
		useProjectKits.setState({ byProject: { ...byProject, [projectId]: kitData(useBrandKit.getState()) } });
		return;
	}
	const { [projectId]: _dropped, ...rest } = byProject;
	useProjectKits.setState({ byProject: rest });
	if (shared && projectId === activeProject) {
		applying = true;
		useBrandKit.setState(shared);
		applying = false;
	}
}
