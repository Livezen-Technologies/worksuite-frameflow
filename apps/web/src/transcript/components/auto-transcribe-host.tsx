"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { useAutoTranscribe } from "../auto";
import { generateTranscript } from "../generate";
import { useTranscriptStore } from "../store";

/** In the editor: transcribes a downloaded video once it's on the timeline (DL-07). */
export function AutoTranscribeHost() {
	const editor = useEditor();
	const projectId = useEditor((e) => e.project.getActive()?.metadata.id ?? null);
	const duration = useEditor((e) => e.timeline.getTotalDuration());
	const language = useAutoTranscribe((s) => (projectId ? s.pending[projectId] : undefined));
	const running = useRef<string | null>(null);

	useEffect(() => {
		if (!projectId || !language || duration <= 0 || running.current === projectId) return;
		running.current = projectId;
		useAutoTranscribe.getState().clear(projectId);
		const id = toast.loading("Transcribing the download…");
		void generateTranscript({
			editor,
			language,
			engine: "local",
			narrationTrackId: null,
			onStep: (step) => toast.loading(step, { id }),
			onWhisperProgress: (p) =>
				toast.loading(p.status === "loading-model" ? `Loading Whisper ${Math.round(p.progress)}%` : "Transcribing…", { id }),
		})
			.then((transcript) => {
				if (!transcript.segments.length) {
					toast.error("No speech was found in the download", { id });
					return;
				}
				useTranscriptStore.getState().setTranscript({ projectId, transcript });
				useTranscriptStore.getState().openEditor({ projectId });
				toast.success(`Transcribed: ${transcript.segments.length} lines`, { id });
			})
			.catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't transcribe", { id }))
			.finally(() => {
				running.current = null;
			});
	}, [editor, projectId, language, duration]);

	return null;
}
