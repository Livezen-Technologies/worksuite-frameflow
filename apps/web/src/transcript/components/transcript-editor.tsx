"use client";

import { TranscriptAiTools } from "@/ai/components/transcript-ai-tools";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { mediaTimeFromSeconds } from "@/wasm";
import { cn } from "@/utils/ui";
import { buildSubtitlesFromTranscript } from "../build";
import {
	exportTranscript,
	formatClock,
	importTranscript,
	type TranscriptExportFormat,
} from "../format";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import { SCRIPT_LANGUAGE_LABELS } from "../script";
import { useTranscriptStore } from "../store";
import {
	countMatches,
	deleteSegment,
	mergeWithNext,
	replaceAll,
	setAllVerified,
	setSegmentSpeaker,
	splitSegment,
	toggleVerified,
	updateSegmentText,
} from "../transcript";
import type { Transcript, TranscriptSegment } from "../types";
import { regenerateSegment } from "../generate";
import { transcriptionService } from "@/services/transcription/service";
import { TranscriptionSettings } from "./transcription-settings";

/** Lines below this are flagged for a second look. */
const LOW_CONFIDENCE = 0.6;

const EXPORT_FORMATS: TranscriptExportFormat[] = ["srt", "vtt", "txt", "json"];
const SINHALA_STACK = "Inter, 'Noto Sans Sinhala', sans-serif";

function download({
	content,
	mimeType,
	fileName,
}: {
	content: string;
	mimeType: string;
	fileName: string;
}) {
	const url = URL.createObjectURL(
		new Blob([content], { type: `${mimeType};charset=utf-8` }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
}

function nearestSpaceToMiddle(text: string): number {
	const middle = Math.floor(text.length / 2);
	let best = middle;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === " " && Math.abs(i - middle) < bestDistance) {
			best = i;
			bestDistance = Math.abs(i - middle);
		}
	}
	return best;
}

/** Full-screen transcript editor: fix the text first, then build subtitles. */
export function TranscriptEditor() {
	const editor = useEditor();
	const openProjectId = useTranscriptStore((s) => s.openProjectId);
	const transcript = useTranscriptStore((s) =>
		s.openProjectId ? (s.byProject[s.openProjectId] ?? null) : null,
	);
	const setTranscript = useTranscriptStore((s) => s.setTranscript);
	const closeEditor = useTranscriptStore((s) => s.closeEditor);
	const live = useTranscriptStore((s) =>
		s.live && s.live.projectId === s.openProjectId ? s.live : null,
	);
	const [regenerating, setRegenerating] = useState<string | null>(null);
	const [find, setFind] = useState("");
	const [replace, setReplace] = useState("");
	const [isBuilding, setIsBuilding] = useState(false);
	const importRef = useRef<HTMLInputElement>(null);
	const cursorRef = useRef<{ id: string; offset: number } | null>(null);

	useEffect(() => {
		if (!openProjectId) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeEditor();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [openProjectId, closeEditor]);

	if (!openProjectId || !transcript) return null;

	const update = (next: Transcript) =>
		setTranscript({ projectId: openProjectId, transcript: next });
	const verifiedCount = transcript.segments.filter((s) => s.verified).length;
	const total = transcript.segments.length;
	const allVerified = total > 0 && verifiedCount === total;
	const matches = countMatches({ transcript, find });

	const trackCursor =
		(id: string) => (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
			cursorRef.current = { id, offset: event.currentTarget.selectionStart };
		};

	const seekTo = (segment: TranscriptSegment) => {
		editor.playback.seek({
			time: mediaTimeFromSeconds({ seconds: segment.start }),
		});
	};

	const handleSplit = (segment: TranscriptSegment) => {
		const cursor = cursorRef.current;
		const offset =
			cursor?.id === segment.id
				? cursor.offset
				: nearestSpaceToMiddle(segment.text);
		const next = splitSegment({ transcript, id: segment.id, offset });
		if (next === transcript) {
			toast.info("Put the cursor between two words to split there.");
			return;
		}
		update(next);
	};

	const speakers = [
		...new Set(
			transcript.segments.map((s) => s.speaker).filter((s): s is string => !!s),
		),
	];
	const lowCount = transcript.segments.filter(
		(s) => (s.confidence ?? 1) < LOW_CONFIDENCE,
	).length;

	const handleRegenerate = async (segment: TranscriptSegment) => {
		setRegenerating(segment.id);
		try {
			const next = await regenerateSegment({
				editor,
				transcript,
				id: segment.id,
			});
			// Keep edits made to other lines while this one was running.
			const latest =
				useTranscriptStore.getState().byProject[openProjectId] ?? transcript;
			const fresh = next.segments.filter(
				(s) => !transcript.segments.some((old) => old.id === s.id),
			);
			const index = latest.segments.findIndex((s) => s.id === segment.id);
			if (index < 0) return;
			const segments = [...latest.segments];
			segments.splice(index, 1, ...fresh);
			update({ ...latest, segments });
			toast.success("Line transcribed again");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't transcribe that line",
			);
		} finally {
			setRegenerating(null);
		}
	};

	const handleExport = (format: TranscriptExportFormat) => {
		const { content, mimeType } = exportTranscript({ transcript, format });
		const name = editor.project.getActive().metadata.name || "transcript";
		download({ content, mimeType, fileName: `${name}.${format}` });
	};

	const handleImport = async (file: File) => {
		try {
			const next = importTranscript({
				fileName: file.name,
				input: await file.text(),
				current: transcript,
			});
			update(next);
			toast.success(`Imported ${next.segments.length} segments`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't import that file",
			);
		}
	};

	const handleBuild = async () => {
		setIsBuilding(true);
		try {
			const { trackId, cueCount } = await buildSubtitlesFromTranscript({
				editor,
				transcript,
			});
			if (!trackId) {
				toast.error("The transcript is empty; there's nothing to place.");
				return;
			}
			toast.success(`Added ${cueCount} subtitles on a new caption track`);
			closeEditor();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't build subtitles",
			);
		} finally {
			setIsBuilding(false);
		}
	};

	const steps = [
		{ label: "Transcript", state: "done" },
		{ label: "Fix", state: allVerified ? "done" : "current" },
		{ label: "Build subtitles", state: allVerified ? "current" : "todo" },
	] as const;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="transcript-title"
			className="bg-background text-foreground fixed inset-0 z-50 flex flex-col text-[13px]"
		>
			<header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Close transcript"
					onClick={closeEditor}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</Button>
				<h1 id="transcript-title" className="m-0 text-base font-semibold">
					Auto captions
				</h1>
				<ol
					className="m-0 flex list-none flex-wrap gap-1.5 p-0"
					aria-label="Steps"
				>
					{steps.map((step, index) => (
						<li
							key={step.label}
							aria-current={step.state === "current" ? "step" : undefined}
							className={cn(
								"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
								step.state === "done" && "bg-constructive/15 text-constructive",
								step.state === "current" &&
									"bg-secondary text-secondary-foreground",
								step.state === "todo" && "bg-popover text-muted-foreground",
							)}
						>
							<span aria-hidden="true">
								{step.state === "done" ? "✓" : index + 1}
							</span>
							{step.label}
						</li>
					))}
				</ol>
				<div className="flex-1" />
				<span className="text-muted-foreground" role="status">
					{verifiedCount} of {total} segments verified
				</span>
				{!allVerified && (
					<Button
						variant="outline"
						className="bg-accent"
						onClick={() =>
							update(setAllVerified({ transcript, verified: true }))
						}
					>
						Mark all verified
					</Button>
				)}
				<Button onClick={handleBuild} disabled={!allVerified || isBuilding}>
					{isBuilding ? "Building…" : "Confirm transcript → Build subtitles"}
				</Button>
			</header>

			{live && (
				<div
					role="status"
					className="bg-secondary/40 flex shrink-0 items-center gap-3 border-b px-4 py-2"
				>
					<span className="bg-primary size-2 animate-pulse rounded-full" aria-hidden="true" />
					<span className="flex-1">{live.step}</span>
					<span className="text-muted-foreground">Lines appear as they&apos;re found.</span>
					<Button variant="outline" size="sm" onClick={() => transcriptionService.cancel()}>
						Cancel
					</Button>
				</div>
			)}

			<div className="flex min-h-0 flex-1 overflow-hidden max-md:flex-col">
				<aside className="bg-sidebar flex min-w-0 shrink-0 basis-[280px] flex-col gap-4 overflow-auto border-r p-4 max-md:max-h-56 max-md:basis-auto max-md:border-r-0 max-md:border-b">
					<TranscriptAiTools transcript={transcript} onChange={update} />
					<section className="flex flex-col gap-1.5">
						<h2 className="m-0 text-sm font-semibold">Transcription</h2>
						<p className="text-muted-foreground m-0 leading-relaxed">
							Engine:{" "}
							<span className="text-foreground">{transcript.engine}</span>
							<br />
							Language:{" "}
							<span className="text-foreground">
								{transcript.language === "auto"
									? "Auto detect"
									: (TRANSCRIPTION_LANGUAGES.find(
											(l) => l.code === transcript.language,
										)?.name ?? transcript.language)}
							</span>
							{lowCount > 0 && (
								<>
									<br />
									<span className="text-amber-500">
										{lowCount} line{lowCount === 1 ? "" : "s"} to check
									</span>
								</>
							)}
						</p>
					</section>
					<TranscriptionSettings />
					<section className="flex flex-col gap-2">
						<h2 className="m-0 text-sm font-semibold">Import / export</h2>
						<p className="text-muted-foreground m-0 leading-relaxed">
							Fix the text in another app and bring it back. TXT keeps one line
							per segment.
						</p>
						<div className="flex flex-wrap gap-1.5">
							{EXPORT_FORMATS.map((format) => (
								<Button
									key={format}
									variant="outline"
									size="sm"
									className="bg-accent"
									onClick={() => handleExport(format)}
								>
									.{format}
								</Button>
							))}
						</div>
						<Button
							variant="outline"
							className="bg-accent"
							onClick={() => importRef.current?.click()}
						>
							Import file…
						</Button>
						<input
							ref={importRef}
							type="file"
							accept=".srt,.vtt,.ass,.txt,.json"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) void handleImport(file);
							}}
						/>
					</section>
					<section className="text-muted-foreground flex flex-col gap-1 leading-relaxed">
						<h2 className="text-foreground m-0 text-sm font-semibold">
							Subtitles
						</h2>
						Up to 2 lines of 42 characters, 1–7 seconds each. Sinhala uses Noto
						Sans Sinhala, and letters are never split from their vowel signs.
					</section>
				</aside>

				<main className="flex min-h-0 min-w-0 flex-[999_1_560px] flex-col">
					<div className="flex flex-wrap items-center gap-2 border-b p-3">
						<label htmlFor="transcript-find" className="sr-only">
							Find
						</label>
						<Input
							id="transcript-find"
							placeholder="Find"
							value={find}
							onChange={(event) => setFind(event.target.value)}
							className="w-48"
							style={{ fontFamily: SINHALA_STACK }}
						/>
						<label htmlFor="transcript-replace" className="sr-only">
							Replace with
						</label>
						<Input
							id="transcript-replace"
							placeholder="Replace with"
							value={replace}
							onChange={(event) => setReplace(event.target.value)}
							className="w-48"
							style={{ fontFamily: SINHALA_STACK }}
						/>
						<Button
							variant="outline"
							className="bg-accent"
							disabled={matches === 0}
							onClick={() => {
								update(replaceAll({ transcript, find, replace }));
								toast.success(
									`Replaced ${matches} match${matches === 1 ? "" : "es"}`,
								);
							}}
						>
							Replace all{find ? ` (${matches})` : ""}
						</Button>
					</div>

					<datalist id="transcript-speakers">
						{["Speaker 1", "Speaker 2", ...speakers]
							.filter((v, i, a) => a.indexOf(v) === i)
							.map((name) => (
								<option key={name} value={name} />
							))}
					</datalist>
					<ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-auto p-3">
						{transcript.segments.map((segment, index) => (
							<li
								key={segment.id}
								className={cn(
									"bg-card flex flex-wrap items-start gap-3 rounded-lg border p-3",
									segment.verified && "border-constructive/40",
								)}
							>
								<div className="flex w-24 shrink-0 flex-col gap-1">
									<button
										type="button"
										onClick={() => seekTo(segment)}
										className="text-primary text-left font-mono tabular-nums hover:underline"
										aria-label={`Go to segment ${index + 1} at ${formatClock(segment.start)}`}
									>
										▶ {formatClock(segment.start)}
									</button>
									<span className="text-muted-foreground font-mono text-xs tabular-nums">
										→ {formatClock(segment.end)}
									</span>
									<span
										className="bg-popover w-fit rounded px-1.5 py-0.5 text-[11px]"
										title="Script detected in this segment"
										style={{ fontFamily: SINHALA_STACK }}
									>
										{SCRIPT_LANGUAGE_LABELS[segment.lang]}
									</span>
									{segment.confidence !== undefined && (
										<span
											className={cn(
												"w-fit rounded px-1.5 py-0.5 text-[11px] tabular-nums",
												segment.confidence < LOW_CONFIDENCE
													? "bg-amber-500/15 text-amber-500"
													: "bg-popover text-muted-foreground",
											)}
											title="Confidence, from checks on speaking rate, repeats and script. Low lines are worth a second listen."
										>
											{segment.confidence < LOW_CONFIDENCE ? "Check · " : ""}
											{Math.round(segment.confidence * 100)}%
										</span>
									)}
									<label htmlFor={`spk-${segment.id}`} className="sr-only">
										Speaker for segment {index + 1}
									</label>
									<input
										id={`spk-${segment.id}`}
										list="transcript-speakers"
										placeholder="Speaker"
										defaultValue={segment.speaker ?? ""}
										onBlur={(event) => {
											if (event.target.value.trim() === (segment.speaker ?? "")) return;
											update(
												setSegmentSpeaker({
													transcript,
													id: segment.id,
													speaker: event.target.value,
												}),
											);
										}}
										className="bg-input w-full rounded border px-1.5 py-0.5 text-[11px]"
									/>
								</div>
								<label htmlFor={`seg-${segment.id}`} className="sr-only">
									Segment {index + 1} text
								</label>
								<textarea
									id={`seg-${segment.id}`}
									value={segment.text}
									rows={2}
									onChange={(event) =>
										update(
											updateSegmentText({
												transcript,
												id: segment.id,
												text: event.target.value,
											}),
										)
									}
									onSelect={trackCursor(segment.id)}
									onClick={trackCursor(segment.id)}
									onKeyUp={trackCursor(segment.id)}
									className="bg-input min-h-14 min-w-0 flex-1 resize-y rounded-md border px-3 py-2 text-[15px] leading-relaxed"
									style={{ fontFamily: SINHALA_STACK }}
								/>
								<div className="flex shrink-0 flex-col gap-1">
									<Button
										variant={segment.verified ? "default" : "outline"}
										size="sm"
										aria-pressed={segment.verified}
										onClick={() =>
											update(toggleVerified({ transcript, id: segment.id }))
										}
									>
										{segment.verified ? "✓ Verified" : "Verify"}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleSplit(segment)}
									>
										Split at cursor
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={regenerating !== null || live !== null}
										onClick={() => void handleRegenerate(segment)}
										title="Transcribe this line again from its audio"
									>
										{regenerating === segment.id ? "Transcribing…" : "Regenerate"}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={index === total - 1}
										onClick={() =>
											update(mergeWithNext({ transcript, id: segment.id }))
										}
									>
										Merge with next
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive"
										onClick={() =>
											update(deleteSegment({ transcript, id: segment.id }))
										}
									>
										Delete
									</Button>
								</div>
							</li>
						))}
						{total === 0 && (
							<li className="text-muted-foreground p-6 text-center">
								No segments. Import a file or generate the transcript again.
							</li>
						)}
					</ol>
				</main>
			</div>
		</div>
	);
}
