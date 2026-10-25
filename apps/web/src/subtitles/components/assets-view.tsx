import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { aiBridge } from "@/ai/bridge";
import { estimateTranscription } from "@/ai/tasks";
import { AiCostNote } from "@/ai/components/ai-spending";
import { AiSuggestionsPanel } from "@/ai-suggest/components/suggestions-panel";
import { useAiSettings } from "@/ai/store";
import { narrationSources } from "@/captions/narration";
import { useEditor } from "@/editor/use-editor";
import { TICKS_PER_SECOND } from "@/wasm";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	CaptionChunk,
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";
import { generateTranscript } from "@/transcript/generate";
import { useTranscriptStore } from "@/transcript/store";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

const noSubscribe = () => () => {};

export function Captions() {
	const projectLanguage = useEditor(
		(e) => e.project.getActiveOrNull()?.settings.defaults?.captionLanguage,
	);
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>(
			() =>
				TRANSCRIPTION_LANGUAGES.find((l) => l.code === projectLanguage)?.code ??
				"auto",
		);
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const engine = useAiSettings((s) => s.transcribeEngine);
	const setEngine = useAiSettings((s) => s.setTranscribeEngine);
	const hasAi = useSyncExternalStore(
		noSubscribe,
		() => !!aiBridge(),
		() => false,
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();
	const projectId = useEditor((e) => e.project.getActive().metadata.id);
	const transcript = useTranscriptStore((s) => s.byProject[projectId] ?? null);
	const setTranscript = useTranscriptStore((s) => s.setTranscript);
	const openTranscriptEditor = useTranscriptStore((s) => s.openEditor);

	const isProcessing = processing.status === "processing";
	const totalSeconds = useEditor(
		(e) => e.timeline.getTotalDuration() / TICKS_PER_SECOND,
	);
	const sceneTracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const sources = useMemo(() => narrationSources(sceneTracks), [sceneTracks]);
	const [narration, setNarration] = useState<string>("all");
	const narrationTrackId =
		narration !== "all" && sources.some((s) => s.id === narration) ? narration : null;

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading model ${Math.round(progress.progress)}%`,
			});
		} else if (progress.status === "transcribing") {
			dispatch({ type: "update_step", step: "Transcribing..." });
		}
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): boolean => {
		const trackId = insertCaptionChunksAsTextTrack({ editor, captions });
		return trackId !== null;
	};

	const handleGenerateTranscript = async () => {
		dispatch({ type: "start", step: "Extracting audio..." });
		const transcriptStore = useTranscriptStore.getState();
		let opened = false;
		try {
			const nextTranscript = await generateTranscript({
				editor,
				language: selectedLanguage,
				engine: engine === "gemini" ? "gemini" : "local",
				narrationTrackId,
				onStep: (step) => dispatch({ type: "update_step", step }),
				onWhisperProgress: (progress) => {
					handleProgress(progress);
					if (progress.message) transcriptStore.setLive({ projectId, step: progress.message });
				},
				// Lines show in the editor as each piece of audio is done.
				onPartial: (partial) => {
					if (!partial.segments.length) return;
					setTranscript({ projectId, transcript: partial });
					if (!opened) {
						opened = true;
						openTranscriptEditor({ projectId });
					}
				},
			});
			if (nextTranscript.segments.length === 0) {
				dispatch({
					type: "fail",
					error: "No speech was found in the timeline audio",
				});
				return;
			}
			setTranscript({ projectId, transcript: nextTranscript });
			openTranscriptEditor({ projectId });

			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		} finally {
			transcriptStore.setLive(null);
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Narration">
							<Select value={narration} onValueChange={setNarration}>
								<SelectTrigger data-narration-source>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All audio, mixed</SelectItem>
									{sources.map((source) => (
										<SelectItem
											key={source.id}
											value={source.id}
											data-narration-option={source.id}
										>
											{source.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						{hasAi && (
							<SectionField label="Engine">
								<Select
									value={engine}
									onValueChange={(value) =>
										setEngine(value === "gemini" ? "gemini" : "local")
									}
								>
									<SelectTrigger data-transcribe-engine>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="local">
											On this device (Whisper)
										</SelectItem>
										<SelectItem value="gemini">
											Gemini (cloud, your key)
										</SelectItem>
									</SelectContent>
								</Select>
								{engine === "gemini" && (
									<AiCostNote
										estimate={estimateTranscription({
											seconds: totalSeconds,
										})}
									/>
								)}
							</SectionField>
						)}
					</SectionFields>

					{hasAi && <AiSuggestionsPanel />}
					{transcript && (
						<div className="bg-card flex flex-col gap-2 rounded-lg border p-3">
							<div className="text-sm font-medium">Transcript</div>
							<p className="text-muted-foreground m-0 text-xs">
								{transcript.segments.length} segments ·{" "}
								{
									transcript.segments.filter((segment) => segment.verified)
										.length
								}{" "}
								verified
							</p>
							<Button
								type="button"
								variant="outline"
								className="bg-accent w-full"
								onClick={() => openTranscriptEditor({ projectId })}
								disabled={isProcessing}
							>
								Open transcript
							</Button>
						</div>
					)}

					<Button
						type="button"
						className="mt-auto w-full"
						onClick={handleGenerateTranscript}
						disabled={
							isProcessing ||
							(engine !== "gemini" && activeDiagnostics.length > 0)
						}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing
							? processing.step
							: transcript
								? "Generate transcript again"
								: "Generate transcript"}
					</Button>
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
