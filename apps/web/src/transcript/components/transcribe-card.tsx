"use client";

import { ScissorsLineDashed } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { narrationSources } from "@/captions/narration";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type { TranscriptionLanguage } from "@/transcription/types";
import { generateTranscript } from "../generate";
import { useTranscriptStore } from "../store";
import { transcriptionService } from "@/services/transcription/service";
import { TranscriptionSettings } from "./transcription-settings";

/** Transcript › start: pick the spoken language and the track, then Transcribe (CapCut-style). */
export function TranscribeCard() {
	const editor = useEditor();
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const setTranscript = useTranscriptStore((s) => s.setTranscript);
	const setLive = useTranscriptStore((s) => s.setLive);
	const sources = useMemo(() => narrationSources(tracks), [tracks]);
	const [language, setLanguage] = useState<TranscriptionLanguage>("auto");
	const [track, setTrack] = useState<string>("all");
	const [step, setStep] = useState<string | null>(null);
	const trackId = track !== "all" && sources.some((s) => s.id === track) ? track : null;

	const transcribe = async () => {
		setStep("Preparing…");
		const show = (text: string) => {
			setStep(text);
			setLive({ projectId, step: text });
		};
		try {
			const transcript = await generateTranscript({
				editor,
				language,
				engine: "local",
				narrationTrackId: trackId,
				onStep: show,
				onWhisperProgress: (p) =>
					show(p.status === "loading-model" ? `Loading model ${Math.round(p.progress)}%` : (p.message ?? "Transcribing…")),
				onPartial: (partial) => setTranscript({ projectId, transcript: partial }),
			});
			if (transcript.segments.length === 0) toast.error("No speech was found on that track");
			else setTranscript({ projectId, transcript });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't transcribe");
		} finally {
			setStep(null);
			setLive(null);
		}
	};

	return (
		<div className="bg-accent/40 flex flex-col gap-4 rounded-xl p-5" data-transcribe-card>
			<div className="flex flex-col items-center gap-2 border-b pb-4 text-center">
				<ScissorsLineDashed className="size-6" />
				<h3 className="m-0 text-sm font-semibold">Transcript-based editing</h3>
				<p className="text-muted-foreground m-0 text-xs">Edit videos quickly by editing their transcripts.</p>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">Select spoken language</span>
				<Select
					value={language}
					onValueChange={(v) => setLanguage(TRANSCRIPTION_LANGUAGES.find((l) => l.code === v)?.code ?? "auto")}
				>
					<SelectTrigger data-transcribe-language>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto detect</SelectItem>
						{TRANSCRIPTION_LANGUAGES.map((l) => (
							<SelectItem key={l.code} value={l.code}>
								{l.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="text-muted-foreground text-xs">Select track to transcribe</span>
				<Select value={track} onValueChange={setTrack}>
					<SelectTrigger data-transcribe-track>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All audio, mixed</SelectItem>
						{sources.map((s) => (
							<SelectItem key={s.id} value={s.id}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<details className="text-xs">
				<summary className="text-muted-foreground cursor-pointer">Transcription settings</summary>
				<div className="pt-3">
					<TranscriptionSettings />
				</div>
			</details>
			<div className="flex gap-2">
				<Button className="flex-1" onClick={() => void transcribe()} disabled={step !== null} data-transcribe-start>
					{step ?? "Transcribe"}
				</Button>
				{step !== null && (
					<Button variant="outline" onClick={() => transcriptionService.cancel()}>
						Cancel
					</Button>
				)}
			</div>
		</div>
	);
}
