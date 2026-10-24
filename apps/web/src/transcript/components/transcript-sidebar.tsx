"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, Expand, FileUp, Scissors, Search } from "lucide-react";
import { toast } from "sonner";
import { CutTimeRangeCommand } from "@/commands/timeline";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { captionTracksToCues } from "@/export/captions";
import { cn } from "@/utils/ui";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import { buildSubtitlesFromTranscript } from "../build";
import { formatClock, importTranscript } from "../format";
import { useTranscriptStore } from "../store";
import { TranscribeCard } from "./transcribe-card";
import {
	createTranscript,
	cutTranscriptRange,
	updateSegmentText,
} from "../transcript";
import type { Transcript } from "../types";

const SINHALA_STACK = "Inter, 'Noto Sans Sinhala', sans-serif";

/**
 * Transcript sidebar (SRS ED-17): the transcript next to the video. Lines
 * follow playback; click to jump, double-click to edit, and "Cut from video"
 * removes that stretch from every track and closes the gap.
 */
export function TranscriptSidebar() {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActiveOrNull());
	const projectId = project?.metadata.id ?? "";
	const transcript = useTranscriptStore((s) =>
		projectId ? (s.byProject[projectId] ?? null) : null,
	);
	const setTranscript = useTranscriptStore((s) => s.setTranscript);
	const openEditor = useTranscriptStore((s) => s.openEditor);
	const tracks = useEditor(
		(e) => e.scenes.getActiveSceneOrNull()?.tracks ?? null,
	);
	const [currentTime, setCurrentTime] = useState(() =>
		editor.playback.getCurrentTime(),
	);
	const [query, setQuery] = useState("");
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const offUpdate = editor.playback.onUpdate(setCurrentTime);
		const offSeek = editor.playback.onSeek(setCurrentTime);
		return () => {
			offUpdate();
			offSeek();
		};
	}, [editor.playback]);

	const seconds = currentTime / TICKS_PER_SECOND;
	const activeId =
		transcript?.segments.find((s) => seconds >= s.start && seconds < s.end)
			?.id ?? null;

	// Keep the playing line in view.
	useEffect(() => {
		if (!activeId || editing) return;
		listRef.current
			?.querySelector(`[data-segment="${activeId}"]`)
			?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [activeId, editing]);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		const segments = transcript?.segments ?? [];
		return q
			? segments.filter((s) => s.text.toLowerCase().includes(q))
			: segments;
	}, [transcript, query]);

	const captionCues = useMemo(
		() =>
			tracks
				? captionTracksToCues([
						...tracks.overlay,
						tracks.main,
						...tracks.audio,
					]).flat()
				: [],
		[tracks],
	);

	const save = (next: Transcript) => {
		if (projectId) setTranscript({ projectId, transcript: next });
	};

	const cut = ({ start, end }: { start: number; end: number }) => {
		if (!transcript) return;
		const before = transcript;
		const after = cutTranscriptRange({ transcript, start, end });
		// One undo step for both: Ctrl+Z restores the video and the line.
		editor.command.execute({
			command: new CutTimeRangeCommand({
				start: mediaTimeFromSeconds({ seconds: start }),
				end: mediaTimeFromSeconds({ seconds: end }),
				onExecute: () => save(after),
				onUndo: () => save(before),
			}),
		});
		toast.success(`Cut ${(end - start).toFixed(1)} s from the video`, {
			action: { label: "Undo", onClick: () => editor.command.undo() },
		});
	};

	const fromCaptions = () => {
		const next = createTranscript({
			segments: captionCues.map((cue) => ({
				text: cue.text,
				start: cue.start,
				end: cue.end,
			})),
			language: "auto",
			engine: "captions",
		});
		save(next);
		toast.success(`Transcript made from ${next.segments.length} captions`);
	};

	const onImport = async (file: File | undefined) => {
		if (!file) return;
		try {
			save(
				importTranscript({
					fileName: file.name,
					input: await file.text(),
					current: transcript,
				}),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't read that file",
			);
		}
	};

	if (!project) return null;

	return (
		<PanelView title="Transcript">
			<input
				ref={fileRef}
				type="file"
				accept=".srt,.vtt,.ass,.txt,.json"
				className="hidden"
				onChange={(e) => {
					void onImport(e.target.files?.[0]);
					e.target.value = "";
				}}
			/>
			{!transcript || transcript.segments.length === 0 ? (
				<div className="flex flex-col gap-2" data-transcript-empty>
					<TranscribeCard />
					{captionCues.length > 0 && (
						<Button variant="outline" onClick={fromCaptions}>
							Use the {captionCues.length} captions on the timeline
						</Button>
					)}
					<Button variant="outline" onClick={() => fileRef.current?.click()}>
						<FileUp /> Import SRT, VTT, ASS or JSON
					</Button>
				</div>
			) : (
				<div
					className="flex h-full min-h-0 flex-col gap-2"
					data-transcript-sidebar
				>
					<div className="relative">
						<Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
						<Input
							placeholder="Search the transcript"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="h-8 pl-7"
						/>
					</div>
					<div className="flex items-center justify-between gap-1">
						<span className="text-muted-foreground text-[11px]">
							{transcript.segments.length} lines · click to jump, double-click
							to edit
						</span>
						<div className="flex gap-1">
							<Button
								size="icon"
								variant="text"
								className="size-7"
								aria-label="Open full transcript editor"
								title="Open full editor"
								onClick={() => openEditor({ projectId })}
							>
								<Expand className="size-3.5" />
							</Button>
						</div>
					</div>
					<div
						ref={listRef}
						className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1"
					>
						{visible.map((segment) => {
							const active = segment.id === activeId;
							return (
								<div
									key={segment.id}
									data-segment={segment.id}
									className={cn(
										"group rounded-lg border border-transparent px-2 py-1.5 transition-colors",
										active
											? "border-[#22D3EE]/40 bg-[#22D3EE]/10"
											: "hover:bg-accent/50",
									)}
								>
									<div className="flex items-center justify-between gap-2">
										<button
											type="button"
											className="text-muted-foreground font-mono text-[10px] tabular-nums hover:underline"
											onClick={() =>
												editor.playback.seek({
													time: mediaTimeFromSeconds({
														seconds: segment.start,
													}),
												})
											}
										>
											{formatClock(segment.start)}
										</button>
										<button
											type="button"
											data-cut={segment.id}
											title="Cut this line's stretch out of the video"
											className="text-muted-foreground hover:text-destructive flex items-center gap-1 text-[10px] opacity-0 group-hover:opacity-100 focus:opacity-100"
											onClick={() =>
												cut({ start: segment.start, end: segment.end })
											}
										>
											<Scissors className="size-3" /> Cut from video
										</button>
									</div>
									{editing === segment.id ? (
										<textarea
											// eslint-disable-next-line jsx-a11y/no-autofocus -- editing starts on double-click
											autoFocus
											value={draft}
											onChange={(e) => setDraft(e.target.value)}
											onBlur={() => {
												save(
													updateSegmentText({
														transcript,
														id: segment.id,
														text: draft,
													}),
												);
												setEditing(null);
											}}
											onKeyDown={(e) => {
												if (e.key === "Escape") setEditing(null);
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													e.currentTarget.blur();
												}
											}}
											className="bg-background mt-1 w-full resize-none rounded-md border p-1.5 text-sm"
											style={{ fontFamily: SINHALA_STACK }}
											rows={Math.min(4, Math.ceil(draft.length / 34) + 1)}
										/>
									) : (
										<button
											type="button"
											className="mt-0.5 w-full text-left text-sm leading-relaxed"
											style={{ fontFamily: SINHALA_STACK }}
											onClick={() =>
												editor.playback.seek({
													time: mediaTimeFromSeconds({
														seconds: segment.start,
													}),
												})
											}
											onDoubleClick={() => {
												setEditing(segment.id);
												setDraft(segment.text);
											}}
										>
											{segment.text}
										</button>
									)}
								</div>
							);
						})}
						{visible.length === 0 && (
							<p className="text-muted-foreground py-6 text-center text-xs">
								No lines match.
							</p>
						)}
					</div>
					<Button
						size="sm"
						variant="outline"
						onClick={async () => {
							const { cueCount } = await buildSubtitlesFromTranscript({
								editor,
								transcript,
							});
							toast.success(`Added ${cueCount} captions`);
						}}
					>
						<Captions /> Add as captions
					</Button>
				</div>
			)}
		</PanelView>
	);
}
