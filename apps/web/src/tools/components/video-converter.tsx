"use client";

import { FileVideo, FolderOpen, Pencil, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEditor } from "@/editor/use-editor";
import { formatBytes, LibraryPageShell } from "@/library/components/page-shell";
import { cn } from "@/utils/ui";
import { openSavedInEditor } from "../open-in-editor";

const FORMATS = [
	{ id: "mp4", label: "MP4", hint: "Plays everywhere" },
	{ id: "mov", label: "MOV", hint: "Apple, Final Cut" },
	{ id: "webm", label: "WebM", hint: "Web, small" },
	{ id: "gif", label: "GIF", hint: "Loops, no sound" },
	{ id: "mp3", label: "MP3", hint: "Audio only" },
	{ id: "m4a", label: "M4A", hint: "Audio only" },
	{ id: "wav", label: "WAV", hint: "Audio, lossless" },
] as const;

const SIZES = [
	{ height: 0, label: "Original" },
	{ height: 2160, label: "4K" },
	{ height: 1080, label: "1080p" },
	{ height: 720, label: "720p" },
	{ height: 480, label: "480p" },
] as const;

const QUALITIES = [
	{ id: "high", label: "High" },
	{ id: "medium", label: "Medium" },
	{ id: "small", label: "Small file" },
] as const;

type Job = {
	id: string;
	file: File;
	duration: number;
	status: "waiting" | "converting" | "done" | "error";
	progress: number;
	output?: string;
	error?: string;
};

function mediaDuration(file: File): Promise<number> {
	return new Promise((resolve) => {
		const el = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
		const url = URL.createObjectURL(file);
		el.preload = "metadata";
		el.onloadedmetadata = () => {
			resolve(Number.isFinite(el.duration) ? el.duration : 0);
			URL.revokeObjectURL(url);
		};
		el.onerror = () => {
			resolve(0);
			URL.revokeObjectURL(url);
		};
		el.src = url;
	});
}

/** Tools › Video converter: change format, size and quality of video and audio files. */
export function VideoConverter() {
	const editor = useEditor();
	const router = useRouter();
	const tools = typeof window !== "undefined" ? window.worksuite?.tools : undefined;
	const [format, setFormat] = useState<string>("mp4");
	const [height, setHeight] = useState<number>(0);
	const [quality, setQuality] = useState<string>("medium");
	const [jobs, setJobs] = useState<Job[]>([]);
	const [dragging, setDragging] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const audioOnly = format === "mp3" || format === "m4a" || format === "wav";

	useEffect(
		() =>
			tools?.onConvertProgress(({ jobId, progress }) =>
				setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, progress } : j))),
			),
		[tools],
	);

	const add = async (files: File[]) => {
		const media = files.filter((f) => /^(video|audio)\//.test(f.type) || /\.(mkv|avi|mov|m4v)$/i.test(f.name));
		if (media.length === 0) return toast.error("Choose video or audio files");
		const added = await Promise.all(
			media.map(async (file) => ({
				id: crypto.randomUUID(),
				file,
				duration: await mediaDuration(file),
				status: "waiting" as const,
				progress: 0,
			})),
		);
		setJobs((list) => [...list, ...added]);
	};

	const convertAll = async () => {
		if (!tools) return;
		for (const job of jobs.filter((j) => j.status === "waiting" || j.status === "error")) {
			setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "converting", progress: 0, error: undefined } : j)));
			try {
				const { path } = await tools.convert({
					jobId: job.id,
					input: tools.pathForFile(job.file),
					format,
					height: audioOnly ? 0 : height,
					quality,
					durationSeconds: job.duration,
				});
				setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "done", progress: 1, output: path } : j)));
			} catch (error) {
				const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
				setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "error", error: message } : j)));
			}
		}
	};

	const busy = jobs.some((j) => j.status === "converting");
	const pending = jobs.filter((j) => j.status === "waiting" || j.status === "error").length;

	return (
		<LibraryPageShell title="Video converter" subtitle="Change the format, size and quality of videos and audio. Files stay on this computer.">
			{!tools ? (
				<p className="text-muted-foreground">The converter is part of the desktop app.</p>
			) : (
				<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
					<div className="flex flex-col gap-3">
						<button
							type="button"
							onClick={() => input.current?.click()}
							onDragOver={(e) => {
								e.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={(e) => {
								e.preventDefault();
								setDragging(false);
								void add([...e.dataTransfer.files]);
							}}
							className={cn(
								"flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition",
								dragging ? "border-primary bg-primary/10" : "hover:bg-accent/40",
							)}
							data-converter-drop
						>
							<Upload className="text-muted-foreground size-8" />
							<span className="font-semibold">Drop videos or audio here, or click to choose</span>
							<span className="text-muted-foreground text-xs">MP4, MOV, MKV, WebM, AVI, MP3, WAV, M4A…</span>
						</button>
						<input
							ref={input}
							type="file"
							multiple
							accept="video/*,audio/*,.mkv,.avi"
							className="hidden"
							onChange={(e) => {
								void add([...(e.target.files ?? [])]);
								e.target.value = "";
							}}
						/>
						{jobs.map((job) => (
							<div key={job.id} className="bg-card flex flex-col gap-2 rounded-lg border p-3" data-convert-job={job.status}>
								<div className="flex items-center gap-3">
									<FileVideo className="text-muted-foreground size-5 shrink-0" />
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium">{job.file.name}</div>
										<div className="text-muted-foreground text-xs">
											{formatBytes(job.file.size)}
											{job.duration ? ` · ${Math.round(job.duration)} s` : ""}
											{job.status === "done" && job.output ? ` → ${job.output.split(/[\\/]/).pop()}` : ""}
										</div>
									</div>
									{job.status === "done" && job.output ? (
										<>
											<Button size="sm" variant="ghost" onClick={() => void window.worksuite?.files?.show(job.output ?? "")}>
												<FolderOpen /> Show
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													void openSavedInEditor({ editor, filePath: job.output ?? "", push: router.push }).catch((e: unknown) =>
														toast.error(e instanceof Error ? e.message : String(e)),
													)
												}
											>
												<Pencil /> Edit
											</Button>
										</>
									) : job.status === "converting" ? (
										<Button size="sm" variant="ghost" onClick={() => void tools.cancelConvert(job.id)}>
											Cancel
										</Button>
									) : (
										<Button size="icon" variant="ghost" aria-label="Remove" onClick={() => setJobs((list) => list.filter((j) => j.id !== job.id))}>
											<X />
										</Button>
									)}
								</div>
								{job.status === "converting" && <Progress value={job.progress * 100} className="h-1.5" />}
								{job.error && <p className="m-0 text-xs text-red-500">{job.error}</p>}
							</div>
						))}
					</div>
					<aside className="bg-card flex h-fit flex-col gap-5 rounded-xl border p-4">
						<Group label="Convert to">
							<div className="grid grid-cols-3 gap-1.5">
								{FORMATS.map((f) => (
									<Choice key={f.id} on={format === f.id} onClick={() => setFormat(f.id)} title={f.hint} testId={`format-${f.id}`}>
										{f.label}
									</Choice>
								))}
							</div>
						</Group>
						{!audioOnly && (
							<Group label="Size">
								<div className="grid grid-cols-3 gap-1.5">
									{SIZES.map((s) => (
										<Choice key={s.height} on={height === s.height} onClick={() => setHeight(s.height)}>
											{s.label}
										</Choice>
									))}
								</div>
							</Group>
						)}
						{!audioOnly && format !== "gif" && (
							<Group label="Quality">
								<div className="grid grid-cols-3 gap-1.5">
									{QUALITIES.map((q) => (
										<Choice key={q.id} on={quality === q.id} onClick={() => setQuality(q.id)}>
											{q.label}
										</Choice>
									))}
								</div>
							</Group>
						)}
						<Button disabled={busy || pending === 0} onClick={() => void convertAll()} data-convert-start>
							{busy ? "Converting…" : pending > 1 ? `Convert ${pending} files` : "Convert"}
						</Button>
						<p className="text-muted-foreground m-0 text-xs">Saved to Videos › Worksuite and listed under Exports.</p>
					</aside>
				</div>
			)}
		</LibraryPageShell>
	);
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</span>
			{children}
		</div>
	);
}

function Choice({
	on,
	onClick,
	title,
	testId,
	children,
}: {
	on: boolean;
	onClick: () => void;
	title?: string;
	testId?: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			aria-pressed={on}
			data-choice={testId}
			className={cn(
				"rounded-md border px-2 py-1.5 text-sm transition",
				on ? "border-primary bg-primary/15 text-foreground font-medium" : "text-muted-foreground hover:bg-accent",
			)}
		>
			{children}
		</button>
	);
}
