/** Projects in their own windows (electron/project-windows.js, MP-04, MP-08). */
export interface ProjectWindowsBridge {
	report: (args: { projectId: string | null }) => Promise<{ ok: boolean }>;
	open: (args: {
		projectId: string;
		/** Screen point to put the new window at (a tab dragged out, MP-04). */
		at?: { x: number; y: number };
	}) => Promise<{ opened: boolean; focused?: boolean }>;
	moveToMain: (args: { projectId: string }) => Promise<{ moved: boolean }>;
	isMain: () => Promise<boolean>;
	onNavigate: (listener: (url: string) => void) => () => void;
}

export function windowsBridge(): ProjectWindowsBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.windows ?? null;
}
