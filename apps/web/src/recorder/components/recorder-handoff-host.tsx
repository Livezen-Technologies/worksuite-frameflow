"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { isOpenRecordingMessage, RECORDER_CHANNEL } from "../handoff";

const noSubscribe = () => () => {};

/** In the main window: opens takes from the recorder window in a new project. */
export function RecorderHandoffHost() {
	// The editor exists only in the browser, never while pages prerender.
	const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
	return mounted ? <RecorderHandoffInner /> : null;
}

function RecorderHandoffInner() {
	const editor = useEditor();
	const router = useRouter();
	const pathname = usePathname();
	const isRecorder = pathname?.startsWith("/recorder") ?? false;

	useEffect(() => {
		if (isRecorder || typeof BroadcastChannel === "undefined") return;
		const channel = new BroadcastChannel(RECORDER_CHANNEL);
		channel.onmessage = async (event: MessageEvent<unknown>) => {
			const message = event.data;
			if (!isOpenRecordingMessage(message)) return;
			// Only one window opens it: the main one (project windows skip it).
			const main = (await window.worksuite?.windows?.isMain()) ?? true;
			if (!main) return;
			try {
				const projectId = await editor.project.createNewProject({ name: "Screen recording" });
				// Loaded here, not at the top: the root layout can't import the start flow.
				const { useStartIntent } = await import("@/start/intent");
				useStartIntent.getState().set({
					projectId,
					intent: { kind: "recording", session: message.session, files: message.files },
				});
				router.push(`/editor/${projectId}`);
			} catch (error) {
				toast.error("Couldn't open the recording", {
					description: error instanceof Error ? error.message : String(error),
				});
			}
		};
		return () => channel.close();
	}, [editor, router, isRecorder]);

	return null;
}
