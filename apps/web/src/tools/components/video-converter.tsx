"use client";

import { Check, ChevronDown, ChevronUp, FolderOpen, MoreHorizontal, Pencil, Upload, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ConvertOptions, MediaProbe } from "@/account/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { formatBytes, LibraryPageShell } from "@/library/components/page-shell";
import { cn } from "@/utils/ui";
import { useConversionHistory } from "../history";
import { openSavedInEditor } from "../open-in-editor";
import { ConversionHistory } from "./conversion-history";
import { QuickTools } from "./quick-tools";

/** Output targets (CV-02). */
export const FORMATS = [
	{ id: "mp4-h264", name: "MP4", kind: "H.264", video: true, label: "MP4 · H.264" },
	{ id: "mp4-hevc", name: "MP4", kind: "HEVC", video: true, label: "MP4 · HEVC" },
	{ id: "mov-prores", name: "MOV", kind: "ProRes", video: true, label: "MOV · ProRes 422" },
	{ id: "webm-vp9", name: "WebM", kind: "VP9", video: true, label: "WebM · VP9" },
	{ id: "mkv-copy", name: "MKV", kind: "copy", video: true, label: "MKV · same streams" },
	{ id: "gif", name: "GIF", kind: "anim", video: true, label: "GIF" },
	{ id: "mp3", name: "MP3", kind: "audio", video: false, label: "MP3" },
	{ id: "wav", name: "WAV", kind: "audio", video: false, label: "WAV" },
	{ id: "m4a", name: "M4A", kind: "audio", video: false, label: "M4A" },
	{ id: "flac", name: "FLAC", kind: "audio", video: false, label: "FLAC" },
] as const;

/** Presets (CV-03): a target size picks the bitrate; the rest set format and size. */
const PRESETS = [
	{ id: "custom", label: "Custom (settings below)" },
	{ id: "same", label: "Same as source", format: "mp4-h264", height: 0, quality: 85 },
	{ id: "whatsapp", label: "WhatsApp (under 16 MB)", format: "mp4-h264", height: 720, targetBytes: 15.5e6 },
	{ id: "email", label: "Email (under 25 MB)", format: "mp4-h264", height: 720, targetBytes: 24e6 },
	{ id: "youtube", label: "YouTube 1080p", format: "mp4-h264", height: 1080, quality: 85 },
] as const;

type Status = "probing" | "waiting" | "converting" | "done" | "error";
interface Job {
	id: string;
	file: File;
	input: string;
	probe?: MediaProbe;
	thumb?: string;
	status: Status;
	progress: number;
	startedAt?: number;
	output?: string;
	outBytes?: number;
	error?: string;
	damaged?: boolean;
}

const MEDIA = /\.(mp4|m4v|mov|mkv|avi|webm|mts|m2ts|ts|insv|3gp|mp3|wav|m4a|aac|flac|ogg|opus|wma|heic)$/i;

const isFileEntry = (e: FileSystemEntry): e is FileSystemFileEntry => e.isFile;
const isDirectoryEntry = (e: FileSystemEntry): e is FileSystemDirectoryEntry => e.isDirectory;

/** Every file in a dropped folder, recursively (CV-01). */
async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
	const out: File[] = [];
	const walk = async (entry: FileSystemEntry): Promise<void> => {
		if (isFileEntry(entry)) {
			const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
			if (MEDIA.test(file.name)) out.push(file);
		} else if (isDirectoryEntry(entry)) {
			const reader = entry.createReader();
			for (;;) {
				const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
				if (batch.length === 0) break;
				for (const child of batch) await walk(child);
			}
		}
	};
	for (const item of [...items]) {
		const entry = item.webkitGetAsEntry();
		if (entry) await walk(entry);
	}
	return out;
}

function thumbnailOf(file: File): Promise<string | undefined> {
	if (!file.type.startsWith("video") && !/\.(mov|mkv|mp4|m4v|webm)$/i.test(file.name)) return Promise.resolve(undefined);
	return new Promise((resolve) => {
		const video = document.createElement("video");
		const url = URL.createObjectURL(file);
		const done = (value?: string) => {
			URL.revokeObjectURL(url);
			resolve(value);
		};
		video.muted = true;
		video.preload = "metadata";
		video.onloadeddata = () => {
			video.currentTime = Math.min(1, (video.duration || 2) / 2);
		};
		video.onseeked = () => {
			const canvas = document.createElement("canvas");
			canvas.width = 96;
			canvas.height = 54;
			canvas.getContext("2d")?.drawImage(video, 0, 0, 96, 54);
			done(canvas.toDataURL("image/jpeg", 0.7));
		};
		video.onerror = () => done();
		setTimeout(() => done(), 4000);
		video.src = url;
	});
}

function describeSource(p?: MediaProbe): string {
	if (!p) return "Reading…";
	if (!p.ok) return p.problem ?? "Can't read";
	const parts: string[] = [];
	if (p.hasVideo) {
		const k = p.height && p.height >= 2000 ? "4K" : p.height ? `${p.height}p` : "";
		parts.push(`${(p.videoCodec ?? "").toUpperCase()} ${k}${p.fps ? Math.round(p.fps) : ""}`.trim());
		if (p.hdr) parts.push(p.hdr);
		if (p.camera && p.camera !== "iPhone") parts.push(p.camera);
	} else if (p.hasAudio) parts.push(`${(p.audioCodec ?? "").toUpperCase()} ${p.sampleRate ? `${Math.round(p.sampleRate / 1000)} kHz` : ""}`.trim());
	parts.push(formatBytes(p.bytes));
	return parts.join(" · ");
}

function estimateBytes({ p, options }: { p?: MediaProbe; options: ConvertOptions }): number | null {
	if (!p?.ok || !p.duration) return null;
	const d = p.duration;
	if (options.targetBytes) return Math.min(options.targetBytes, p.bytes);
	if (options.format === "mkv-copy") return p.bytes;
	if (["mp3", "m4a"].includes(options.format)) return ((options.audioKbps ?? 192) * 1000 * d) / 8;
	if (options.format === "wav") return 48000 * 2 * 2 * d;
	if (options.format === "flac") return 48000 * 2 * 2 * d * 0.6;
	if (options.format === "gif") return Math.min(d, 15) * 0.9e6;
	if (options.format === "mov-prores") return ((147e6 * (options.height || p.height || 1080)) / 1080) * (d / 8);
	const h = options.height || p.height || 1080;
	const kbps = ((2500 + ((options.quality ?? 70) / 100) * 12000) * Math.max(240, h)) / 1080;
	const factor = options.format === "mp4-hevc" || options.format === "webm-vp9" ? 0.6 : 1;
	return ((kbps * factor + 192) * 1000 * d) / 8;
}

function timeLeft(job: Job): string {
	if (!job.startedAt || job.progress < 0.03) return "";
	const elapsed = (Date.now() - job.startedAt) / 1000;
	const left = (elapsed / job.progress) * (1 - job.progress);
	return left > 90 ? ` · ${Math.round(left / 60)} min left` : ` · ${Math.max(1, Math.round(left))} s left`;
}

type Tab = "convert" | "tools" | "history";

/** Tools › Video converter (SRS 37.3, screens 23–25). */
export function VideoConverter() {
	const tools = window.worksuite?.tools;
	const [tab, setTab] = useState<Tab>("convert");
	const [gpu, setGpu] = useState<string | null>(null);
	useEffect(() => {
		void tools
			?.caps()
			.then((c) => setGpu(c.gpus.length ? `GPU: ${c.gpus.map((g) => ({ nvidia: "NVENC", intel: "Quick Sync", amd: "AMF", apple: "VideoToolbox", vaapi: "VA-API", windows: "Media Foundation" })[g] ?? g).join(", ")} available` : c.cpu ? "Software encoding (no GPU encoder found)" : "No H.264 encoder: use WebM"))
			.catch(() => {});
	}, [tools]);

	return (
		<LibraryPageShell
			title="Video converter"
			subtitle="Convert, compress and change format without opening the editor. Originals are never changed."
			actions={
				<div className="flex items-center gap-3">
					{gpu && <span className="text-muted-foreground hidden text-xs md:inline">{gpu}</span>}
					<nav className="bg-accent/60 flex rounded-lg p-1 text-sm" aria-label="Converter">
						{(
							[
								["convert", "Convert"],
								["tools", "Quick tools"],
								["history", "History"],
							] as const
						).map(([id, label]) => (
							<button
								key={id}
								type="button"
								onClick={() => setTab(id)}
								aria-pressed={tab === id}
								className={cn("rounded-md px-3 py-1", tab === id ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}
								data-converter-tab={id}
							>
								{label}
							</button>
						))}
					</nav>
				</div>
			}
		>
			{!tools ? (
				<p className="text-muted-foreground">The converter is part of the desktop app.</p>
			) : tab === "convert" ? (
				<ConvertTab />
			) : tab === "tools" ? (
				<QuickTools />
			) : (
				<ConversionHistory />
			)}
		</LibraryPageShell>
	);
}

function ConvertTab() {
	const editor = useEditor();
	const router = useRouter();
	const tools = window.worksuite?.tools;
	const addRecord = useConversionHistory((s) => s.add);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [format, setFormat] = useState<string>("mp4-h264");
	const [preset, setPreset] = useState<string>("custom");
	const [height, setHeight] = useState(0);
	const [fps, setFps] = useState(0);
	const [quality, setQuality] = useState(70);
	const [encoder, setEncoder] = useState<"auto" | "sw">("auto");
	const [toneMap, setToneMap] = useState(true);
	const [burnSubtitles, setBurnSubtitles] = useState(false);
	const [loudnorm, setLoudnorm] = useState(false);
	const [removeAudio, setRemoveAudio] = useState(false);
	const [audioKbps, setAudioKbps] = useState(192);
	const [denoise, setDenoise] = useState(false);
	const [saveTo, setSaveTo] = useState<string>("same");
	const [dragging, setDragging] = useState(false);
	const [session, setSession] = useState<{ started: number; finished?: number } | null>(null);
	const input = useRef<HTMLInputElement>(null);

	const spec = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
	const presetSpec = PRESETS.find((p) => p.id === preset);
	const options: ConvertOptions = {
		format,
		height: height || undefined,
		fps: fps || undefined,
		quality,
		encoder,
		toneMap,
		burnSubtitles,
		loudnorm,
		removeAudio,
		audioKbps,
		denoise,
		targetBytes: presetSpec && "targetBytes" in presetSpec ? presetSpec.targetBytes : undefined,
	};

	useEffect(
		() =>
			tools?.onConvertProgress(({ jobId, progress }) =>
				setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, progress } : j))),
			),
		[tools],
	);

	const pickPreset = (id: string) => {
		setPreset(id);
		const p = PRESETS.find((x) => x.id === id);
		if (!p || p.id === "custom") return;
		setFormat(p.format);
		setHeight(p.height);
		if ("quality" in p) setQuality(p.quality);
	};

	const add = async (files: File[]) => {
		if (!tools) return;
		const media = files.filter((f) => MEDIA.test(f.name) || /^(video|audio)\//.test(f.type));
		if (media.length === 0) return void toast.error("Choose video or audio files");
		const added: Job[] = media.map((file) => ({ id: crypto.randomUUID(), file, input: tools.pathForFile(file), status: "probing", progress: 0 }));
		setJobs((list) => [...list, ...added]);
		for (const job of added) {
			void Promise.all([tools.probe(job.input), thumbnailOf(job.file)]).then(([probe, thumb]) =>
				setJobs((list) =>
					list.map((j) =>
						j.id === job.id
							? { ...j, probe, thumb, status: probe.ok ? "waiting" : "error", damaged: !probe.ok, error: probe.ok ? undefined : probe.problem }
							: j,
					),
				),
			);
		}
	};

	const convertAll = async () => {
		if (!tools) return;
		const todo = jobs.filter((j) => j.status === "waiting" || (j.status === "error" && !j.damaged));
		if (todo.length === 0) return;
		setSession({ started: Date.now() });
		for (const job of todo) {
			setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "converting", progress: 0, startedAt: Date.now(), error: undefined } : j)));
			try {
				const result = await tools.convert({ jobId: job.id, input: job.input, options, saveTo });
				setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "done", progress: 1, output: result.path, outBytes: result.bytes } : j)));
				addRecord({ id: job.id, name: job.file.name, output: result.path, to: spec.label, sourceBytes: result.sourceBytes ?? job.file.size, bytes: result.bytes, at: Date.now() });
			} catch (error) {
				const message = cleanError(error);
				setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "error", error: message } : j)));
			}
		}
		setSession((s) => (s ? { ...s, finished: Date.now() } : s));
	};

	const repairAndConvert = async (job: Job) => {
		if (!tools) return;
		setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "converting", progress: 0, startedAt: Date.now(), error: undefined } : j)));
		try {
			const repaired = await tools.repair({ jobId: job.id, input: job.input, saveTo });
			const result = await tools.convert({ jobId: job.id, input: repaired.path, options, saveTo });
			setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "done", progress: 1, damaged: false, output: result.path, outBytes: result.bytes } : j)));
			toast.success(`Recovered ${Math.round(repaired.duration)} s and converted it`);
		} catch (error) {
			setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "error", error: cleanError(error) } : j)));
		}
	};

	const move = ({ id, by }: { id: string; by: number }) =>
		setJobs((list) => {
			const i = list.findIndex((j) => j.id === id);
			const k = i + by;
			if (i < 0 || k < 0 || k >= list.length) return list;
			const next = [...list];
			[next[i], next[k]] = [next[k]!, next[i]!];
			return next;
		});

	const busy = jobs.some((j) => j.status === "converting");
	const pending = jobs.filter((j) => j.status === "waiting" || (j.status === "error" && !j.damaged)).length;
	const totals = useMemo(() => {
		let before = 0;
		let after = 0;
		for (const j of jobs) {
			before += j.probe?.bytes ?? j.file.size;
			after += j.outBytes ?? estimateBytes({ p: j.probe, options }) ?? 0;
		}
		return { before, after };
	}, [jobs, options]);
	const done = jobs.filter((j) => j.status === "done");
	const damaged = jobs.filter((j) => j.damaged);

	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" data-converter>
			<div className="flex min-w-0 flex-col gap-3">
				{session?.finished && done.length > 0 && !busy && (
					<section className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4" data-convert-summary>
						<span className="flex size-10 items-center justify-center rounded-full bg-emerald-500 text-black">
							<Check className="size-5" />
						</span>
						<div className="min-w-0 flex-1">
							<div className="font-semibold">
								{done.length} of {jobs.length} file{jobs.length === 1 ? "" : "s"} converted
							</div>
							<div className="text-sm text-emerald-300">
								{formatBytes(done.reduce((n, j) => n + (j.probe?.bytes ?? j.file.size), 0))} became {formatBytes(done.reduce((n, j) => n + (j.outBytes ?? 0), 0))}
								{(() => {
									const saved = done.reduce((n, j) => n + (j.probe?.bytes ?? j.file.size) - (j.outBytes ?? 0), 0);
									return saved > 0 ? ` · saved ${formatBytes(saved)}` : "";
								})()}{" "}
								· took {Math.max(1, Math.round((session.finished - session.started) / 1000))} s
							</div>
						</div>
						<Button variant="outline" onClick={() => done[0]?.output && void window.worksuite?.files?.show(done[0].output)}>
							<FolderOpen /> Show in folder
						</Button>
						<Button onClick={() => input.current?.click()}>Convert more</Button>
					</section>
				)}
				{damaged.map((job) => (
					<section key={job.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm" data-convert-damaged>
						<b className="text-red-300">Why {job.file.name} can&apos;t be read</b>
						<span className="min-w-60 flex-1 text-red-100/90">{job.error} FrameFlow can try to rebuild it from the part that can still be read.</span>
						<Button size="sm" variant="secondary" onClick={() => void repairAndConvert(job)} disabled={busy}>
							<Wrench /> Repair and convert
						</Button>
					</section>
				))}
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
						void filesFromDrop(e.dataTransfer.items).then(add);
					}}
					className={cn("bg-card flex items-center gap-4 rounded-xl border-2 border-dashed p-4 text-left transition", dragging ? "border-primary bg-primary/10" : "hover:bg-accent/40")}
					data-converter-drop
				>
					<span className="bg-primary/15 text-primary flex size-11 shrink-0 items-center justify-center rounded-lg">
						<Upload className="size-5" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block font-semibold">Drop videos, audio or a whole folder here</span>
						<span className="text-muted-foreground block text-xs">MP4, MOV, MKV, AVI, WebM, MTS, iPhone HEVC/HLG, GoPro, DJI, Insta360 MP4, MP3, WAV, M4A, FLAC</span>
					</span>
					<span className="bg-accent rounded-md px-3 py-1.5 text-sm font-medium">Add files…</span>
				</button>
				<input
					ref={input}
					type="file"
					multiple
					accept="video/*,audio/*,.mkv,.avi,.mts,.m2ts,.insv"
					className="hidden"
					onChange={(e) => {
						void add([...(e.target.files ?? [])]);
						e.target.value = "";
					}}
				/>
				<div className="flex items-center gap-3 text-sm">
					<b className="flex-1">
						Queue · {jobs.length} file{jobs.length === 1 ? "" : "s"}
					</b>
					{jobs.length > 0 && (
						<span className="text-muted-foreground">
							Total ≈ {formatBytes(totals.before)} → ≈ {formatBytes(totals.after)}
						</span>
					)}
					<Button size="sm" variant="outline" disabled={!jobs.some((j) => j.status === "done")} onClick={() => setJobs((l) => l.filter((j) => j.status !== "done"))}>
						Clear finished
					</Button>
				</div>
				<div className="overflow-x-auto rounded-lg border">
					<div className="grid min-w-[760px] grid-cols-[2.2fr_1.6fr_1.1fr_0.8fr_1.5fr_40px] text-sm">
						{["File", "Source", "Output", "Size", "Status", ""].map((h) => (
							<div key={h} className="text-muted-foreground border-b px-3 py-2 text-xs font-semibold">
								{h}
							</div>
						))}
						{jobs.length === 0 && <div className="text-muted-foreground col-span-6 px-3 py-8 text-center">Add files to start.</div>}
						{jobs.map((job, index) => {
							const est = job.outBytes ?? estimateBytes({ p: job.probe, options });
							const color = job.status === "done" ? "text-emerald-400" : job.status === "error" ? "text-red-400" : job.status === "converting" ? "text-primary" : "text-muted-foreground";
							return (
								<div key={job.id} className="contents" data-convert-job={job.status}>
									<div className="flex min-w-0 items-center gap-2.5 border-b px-3 py-2.5">
										{job.thumb ? (
											// eslint-disable-next-line @next/next/no-img-element -- local thumbnail
											<img src={job.thumb} alt="" className="h-7 w-12 shrink-0 rounded object-cover" />
										) : (
											<span className="bg-muted h-7 w-12 shrink-0 rounded" />
										)}
										<span className="truncate">{job.file.name}</span>
									</div>
									<div className="text-muted-foreground truncate border-b px-3 py-2.5">{describeSource(job.probe)}</div>
									<div className="truncate border-b px-3 py-2.5">{spec.video || !job.probe?.hasVideo ? spec.label : spec.label}</div>
									<div className="border-b px-3 py-2.5 tabular-nums">{est ? `${job.outBytes ? "" : "≈ "}${formatBytes(est)}` : "—"}</div>
									<div className="flex flex-col justify-center gap-1 border-b px-3 py-2.5">
										<span className={cn("truncate text-xs", color)} title={job.error}>
											{job.status === "probing"
												? "Reading file…"
												: job.status === "waiting"
													? "Waiting"
													: job.status === "converting"
														? `Converting · ${Math.round(job.progress * 100)}%${timeLeft(job)}`
														: job.status === "done"
															? `Done · ${saveTo === "same" ? "saved next to original" : "saved"}`
															: job.damaged
																? "Damaged file · repair offered above"
																: `Failed · ${job.error}`}
										</span>
										<span className="bg-muted h-1.5 overflow-hidden rounded">
											<span
												className={cn("block h-full", job.status === "done" ? "bg-emerald-500" : job.status === "error" ? "bg-red-500" : "bg-primary")}
												style={{ width: `${job.status === "done" ? 100 : Math.round(job.progress * 100)}%` }}
											/>
										</span>
									</div>
									<div className="flex items-center border-b px-1">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon" variant="ghost" aria-label={`More for ${job.file.name}`}>
													<MoreHorizontal />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												{job.output && (
													<>
														<DropdownMenuItem onClick={() => void window.worksuite?.files?.show(job.output ?? "")}>
															<FolderOpen /> Show in folder
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																void openSavedInEditor({ editor, filePath: job.output ?? "", push: router.push }).catch((e: unknown) =>
																	toast.error(cleanError(e)),
																)
															}
														>
															<Pencil /> Open in editor
														</DropdownMenuItem>
													</>
												)}
												{job.status === "converting" ? (
													<DropdownMenuItem onClick={() => void window.worksuite?.tools?.cancelConvert(job.id)}>
														<X /> Cancel
													</DropdownMenuItem>
												) : (
													<>
														<DropdownMenuItem disabled={index === 0} onClick={() => move({ id: job.id, by: -1 })}>
															<ChevronUp /> Move up
														</DropdownMenuItem>
														<DropdownMenuItem disabled={index === jobs.length - 1} onClick={() => move({ id: job.id, by: 1 })}>
															<ChevronDown /> Move down
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => setJobs((l) => l.filter((j) => j.id !== job.id))}>
															<X /> Remove
														</DropdownMenuItem>
													</>
												)}
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<aside className="bg-card flex h-fit flex-col gap-3.5 rounded-xl border p-4 text-sm">
				<b>Convert to</b>
				<div className="grid grid-cols-4 gap-1.5">
					{FORMATS.map((f) => (
						<button
							key={f.id}
							type="button"
							onClick={() => {
								setFormat(f.id);
								setPreset("custom");
							}}
							aria-pressed={format === f.id}
							className={cn(
								"flex h-13 flex-col items-center justify-center rounded-lg border-2 py-1.5",
								format === f.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
							)}
							data-format={f.id}
						>
							<b className="text-sm">{f.name}</b>
							<span className="text-muted-foreground text-[10px]">{f.kind}</span>
						</button>
					))}
				</div>
				<Field label="Preset">
					<select className="bg-background h-9 rounded-md border px-2" value={preset} onChange={(e) => pickPreset(e.target.value)} data-convert-preset>
						{PRESETS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label}
							</option>
						))}
					</select>
				</Field>
				{spec.video && format !== "mkv-copy" && (
					<>
						<div className="grid grid-cols-2 gap-2.5">
							<Field label="Resolution">
								<select className="bg-background h-9 rounded-md border px-2" value={height} onChange={(e) => setHeight(Number(e.target.value))}>
									<option value={0}>Same as source</option>
									<option value={2160}>4K</option>
									<option value={1440}>1440p</option>
									<option value={1080}>1080p</option>
									<option value={720}>720p</option>
									<option value={480}>480p</option>
								</select>
							</Field>
							<Field label="Frame rate">
								<select className="bg-background h-9 rounded-md border px-2" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
									<option value={0}>Same as source</option>
									{[24, 25, 30, 50, 60].map((v) => (
										<option key={v} value={v}>
											{v}
										</option>
									))}
								</select>
							</Field>
							{(format === "mp4-h264" || format === "mp4-hevc") && (
								<Field label="Encoder">
									<select className="bg-background h-9 rounded-md border px-2" value={encoder} onChange={(e) => setEncoder(e.target.value === "sw" ? "sw" : "auto")}>
										<option value="auto">Hardware (GPU) when available</option>
										<option value="sw">Software</option>
									</select>
								</Field>
							)}
						</div>
						{format !== "gif" && !options.targetBytes && (
							<label className="grid grid-cols-[64px_1fr_56px] items-center gap-2">
								Quality
								<input type="range" min={0} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="Quality" />
								<span className="text-muted-foreground text-xs">{quality > 75 ? "High" : quality > 40 ? "Medium" : "Small"}</span>
							</label>
						)}
						{format !== "gif" && (
							<div className="flex flex-col gap-1.5">
								<Check2 checked={toneMap} onChange={setToneMap} label="HDR (HLG/PQ) → SDR, tone-mapped" />
								<Check2 checked={burnSubtitles} onChange={setBurnSubtitles} label="Burn in subtitles from an .srt with the same name" />
								<Check2 checked={loudnorm} onChange={setLoudnorm} label="Normalise loudness to −14 LUFS" />
								<Check2 checked={removeAudio} onChange={setRemoveAudio} label="Remove audio" />
							</div>
						)}
					</>
				)}
				{!spec.video && (
					<>
						{(format === "mp3" || format === "m4a") && (
							<Field label="Audio quality">
								<select className="bg-background h-9 rounded-md border px-2" value={audioKbps} onChange={(e) => setAudioKbps(Number(e.target.value))}>
									<option value={320}>320 kbps</option>
									<option value={192}>192 kbps</option>
									<option value={128}>128 kbps</option>
								</select>
							</Field>
						)}
						<Check2 checked={denoise} onChange={setDenoise} label="Clean up voice (denoise)" />
						<Check2 checked={loudnorm} onChange={setLoudnorm} label="Normalise loudness to −14 LUFS" />
					</>
				)}
				<div className="bg-border h-px" />
				<Field label="Save to">
					<select
						className="bg-background h-9 rounded-md border px-2"
						value={saveTo === "same" || saveTo === "converted" ? saveTo : "custom"}
						onChange={(e) => {
							if (e.target.value === "custom") void window.worksuite?.tools?.chooseFolder().then((p) => p && setSaveTo(p));
							else setSaveTo(e.target.value);
						}}
						data-convert-saveto
					>
						<option value="same">Same folder as the original</option>
						<option value="converted">Videos/Worksuite/Converted</option>
						<option value="custom">{saveTo !== "same" && saveTo !== "converted" ? saveTo : "Choose folder…"}</option>
					</select>
				</Field>
				<Check2 checked disabled onChange={() => {}} label="Keep originals (never overwrite)" />
				<Button className="h-11 text-base font-bold" disabled={busy || pending === 0} onClick={() => void convertAll()} data-convert-start>
					{busy ? "Converting…" : `Convert ${pending || ""} file${pending === 1 ? "" : "s"}`.replace("  ", " ")}
				</Button>
			</aside>
		</div>
	);
}

export function cleanError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="text-muted-foreground flex flex-col gap-1 text-xs">
			<span>{label}</span>
			<div className="text-foreground flex flex-col text-sm">{children}</div>
		</div>
	);
}

export function Check2({
	checked,
	onChange,
	label,
	disabled,
}: {
	checked: boolean;
	onChange: (on: boolean) => void;
	label: string;
	disabled?: boolean;
}) {
	return (
		<label className={cn("flex items-center gap-2", disabled && "opacity-80")}>
			<input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
			{label}
		</label>
	);
}
