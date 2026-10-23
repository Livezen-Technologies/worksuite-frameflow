/** The desktop app's project-folder bridge (electron/project-folders.js). */
export interface ProjectFoldersBridge {
	get: (args: { projectId: string }) => Promise<string | null>;
	create: (args: {
		projectId: string;
		name: string;
	}) => Promise<{ saved: boolean; path?: string }>;
	open: () => Promise<
		| { opened: true; path: string; project: string; media: string }
		| { opened: false; error?: string }
	>;
	attach: (args: {
		projectId: string;
		root: string;
	}) => Promise<{ path: string }>;
	unlink: (args: { projectId: string }) => Promise<void>;
	writeJson: (args: {
		projectId: string;
		name: "project.json" | "media.json";
		text: string;
	}) => Promise<void>;
	listMedia: (args: {
		projectId: string;
	}) => Promise<{ name: string; size: number }[]>;
	writeMedia: (args: {
		projectId: string;
		fileName: string;
		data: ArrayBuffer;
	}) => Promise<void>;
	readMedia: (args: {
		root?: string;
		projectId?: string;
		fileName: string;
	}) => Promise<ArrayBuffer>;
	removeMedia: (args: { projectId: string; fileName: string }) => Promise<void>;
	show: (args: { projectId: string }) => Promise<void>;
	move: (args: {
		projectId: string;
	}) => Promise<{ moved: boolean; path?: string; error?: string }>;
}

export function foldersBridge(): ProjectFoldersBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.folders ?? null;
}
