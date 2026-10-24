"use client";

import type { EditorCore } from "@/core";
import { useStartIntent } from "@/start/intent";

const TYPES: Record<string, string> = {
	mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", m4v: "video/mp4",
	gif: "image/gif", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
};

/** Opens a file the app saved (converted or downloaded) in a new project. */
export async function openSavedInEditor({
	editor,
	filePath,
	push,
}: {
	editor: EditorCore;
	filePath: string;
	push: (url: string) => void;
}): Promise<void> {
	const tools = window.worksuite?.tools;
	if (!tools) throw new Error("Opening files needs the desktop app.");
	const name = filePath.split(/[\\/]/).pop() ?? "video";
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const file = new File([await tools.readSaved(filePath)], name, { type: TYPES[ext] ?? "" });
	const projectId = await editor.project.createNewProject({ name: name.replace(/\.[^.]+$/, "") });
	useStartIntent.getState().set({ projectId, intent: { kind: "import", files: [file] } });
	push(`/editor/${projectId}`);
}
