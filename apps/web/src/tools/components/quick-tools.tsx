"use client";

import { FolderOpen, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ConvertOptions, ConvertResult } from "@/account/types";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/library/components/page-shell";
import { cn } from "@/utils/ui";
import { useConversionHistory } from "../history";
import { cleanError, Field } from "./video-converter";

const TOOLS = [
	{ id: "trim", label: "Trim", hint: "Cut the start and end without re-encoding." },
	{ id: "merge", label: "Merge", hint: "Join clips in order into one file." },
	{ id: "audio", label: "Extract audio", hint: "Save the soundtrack as MP3." },
	{ id: "gif", label: "Make GIF", hint: "Turn a range into an animated GIF." },
	{ id: "rotate", label: "Rotate & crop", hint: "Fix sideways phone video or crop to square." },
	{ id: "compress", label: "Compress to size", hint: "Hit an exact file size for sharing." },
] as const;

const ROTATIONS = [0, 90, 180, 270] as const;

type ToolId = (typeof TOOLS)[number]["id"];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Screen 24: single-purpose tools on top of the converter (CV-06). */
export function QuickTools() {
	const tools = window.worksuite?.tools;
	const addRecord = useConversionHistory((s) => s.add);
	const [tool, setTool] = useState<ToolId>("trim");
	const [files, setFiles] = useState<File[]>([]);
	const [duration, setDuration] = useState(0);
	const [start, setStart] = useState(0);
	const [end, setEnd] = useState(0);
	const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(90);
	const [square, setSquare] = useState(false);
	const [targetMb, setTargetMb] = useState(25);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState(0);
	const [result, setResult] = useState<ConvertResult | null>(null);
	const input = useRef<HTMLInputElement>(null);
	const video = useRef<HTMLVideoElement>(null);
	const jobRef = useRef("");

	const file = files[0];
	const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
	useEffect(() => () => {
		if (url) URL.revokeObjectURL(url);
	}, [url]);

	useEffect(
		() => tools?.onConvertProgress(({ jobId, progress: p }) => jobId === jobRef.current && setProgress(p)),
		[tools],
	);

	const pick = (list: File[]) => {
		const media = list.filter((f) => f.type.startsWith("video/") || f.type.startsWith("audio/"));
		if (!media.length) return;
		setFiles(tool === "merge" ? [...files, ...media] : media.slice(0, 1));
		setResult(null);
	};

	const run = async () => {
		if (!tools || !file) return;
		const jobId = crypto.randomUUID();
		jobRef.current = jobId;
		setBusy(true);
		setProgress(0);
		setResult(null);
		const inputPath = tools.pathForFile(file);
		const range = { start, end: end || duration };
		try {
			let out: ConvertResult;
			if (tool === "trim") out = await tools.trim({ jobId, input: inputPath, ...range });
			else if (tool === "merge") out = await tools.merge({ jobId, inputs: files.map((f) => tools.pathForFile(f)) });
			else {
				const options: ConvertOptions =
					tool === "audio"
						? { format: "mp3", audioKbps: 192, ...range }
						: tool === "gif"
							? { format: "gif", height: 480, fps: 15, ...range, suffix: "gif" }
							: tool === "rotate"
								? { format: "mp4-h264", rotate, crop: square ? "1:1" : null, suffix: "rotated" }
								: { format: "mp4-h264", targetBytes: targetMb * 1e6, suffix: `${targetMb} MB` };
				out = await tools.convert({ jobId, input: inputPath, options });
			}
			setResult(out);
			addRecord({
				id: jobId,
				name: file.name,
				output: out.path,
				to: TOOLS.find((t) => t.id === tool)?.label ?? tool,
				sourceBytes: files.reduce((n, f) => n + f.size, 0),
				bytes: out.bytes,
				at: Date.now(),
			});
			toast.success(`Saved ${out.path.split(/[\\/]/).pop()}`);
		} catch (error) {
			toast.error(cleanError(error));
		} finally {
			setBusy(false);
		}
	};

	const usesRange = tool === "trim" || tool === "audio" || tool === "gif";
	const spec = TOOLS.find((t) => t.id === tool) ?? TOOLS[0];

	return (
		<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-4" data-quick-tools>
			<section className="flex min-w-0 flex-col gap-3">
				<div className="flex flex-wrap gap-2">
					{TOOLS.map((t) => (
						<button
							key={t.id}
							type="button"
							data-quick-tool={t.id}
							onClick={() => {
								setTool(t.id);
								setResult(null);
								if (t.id !== "merge") setFiles((f) => f.slice(0, 1));
							}}
							className={cn(
								"rounded-full border px-3 py-1.5 text-sm",
								tool === t.id ? "border-primary bg-primary/10 text-primary font-semibold" : "hover:bg-accent",
							)}
						>
							{t.label}
						</button>
					))}
				</div>
				<div
					className="bg-muted/40 relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-xl border"
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						pick([...e.dataTransfer.files]);
					}}
				>
					{url ? (
						<video
							ref={video}
							src={url}
							controls
							className="max-h-full max-w-full"
							style={tool === "rotate" ? { transform: `rotate(${rotate}deg)` } : undefined}
							onLoadedMetadata={(e) => {
								const d = e.currentTarget.duration || 0;
								setDuration(d);
								setStart(0);
								setEnd(d);
							}}
						>
							<track kind="captions" />
						</video>
					) : (
						<button type="button" className="text-muted-foreground flex flex-col items-center gap-2" onClick={() => input.current?.click()}>
							<Upload className="size-8" />
							Drop a video here or click to choose
						</button>
					)}
				</div>
				{usesRange && duration > 0 && (
					<div className="flex flex-col gap-2 rounded-lg border p-3 text-sm" data-quick-range>
						<div className="flex justify-between">
							<span>Start {fmt(start)}</span>
							<span className="text-muted-foreground">{fmt(Math.max(0, end - start))} selected</span>
							<span>End {fmt(end)}</span>
						</div>
						<input type="range" min={0} max={duration} step={0.1} value={start} onChange={(e) => {
							const v = Number(e.target.value);
							setStart(Math.min(v, end - 0.1));
							if (video.current) video.current.currentTime = v;
						}} />
						<input type="range" min={0} max={duration} step={0.1} value={end} onChange={(e) => {
							const v = Number(e.target.value);
							setEnd(Math.max(v, start + 0.1));
							if (video.current) video.current.currentTime = v;
						}} />
					</div>
				)}
				{tool === "merge" && files.length > 0 && (
					<ol className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
						{files.map((f, i) => (
							<li key={`${f.name}-${i}`} className="flex justify-between">
								<span className="truncate">{i + 1}. {f.name}</span>
								<button type="button" className="text-muted-foreground" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
							</li>
						))}
					</ol>
				)}
				<input ref={input} type="file" accept="video/*,audio/*" multiple={tool === "merge"} hidden onChange={(e) => {
					pick([...(e.target.files ?? [])]);
					e.target.value = "";
				}} />
			</section>
			<aside className="flex flex-col gap-4 rounded-xl border p-4">
				<div>
					<h3 className="font-semibold">{spec.label}</h3>
					<p className="text-muted-foreground text-xs">{spec.hint}</p>
				</div>
				<Button variant="outline" onClick={() => input.current?.click()}>
					{tool === "merge" ? "Add clips" : file ? "Change file" : "Choose file"}
				</Button>
				{tool === "rotate" && (
					<>
						<Field label="Rotate">
							<select className="rounded border bg-transparent p-1.5" value={rotate} onChange={(e) => setRotate(ROTATIONS.find((r) => r === Number(e.target.value)) ?? 0)}>
								<option value={0}>None</option>
								<option value={90}>90° clockwise</option>
								<option value={180}>180°</option>
								<option value={270}>90° counter-clockwise</option>
							</select>
						</Field>
						<label className="flex items-center gap-2 text-sm">
							<input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} />
							Crop to square
						</label>
					</>
				)}
				{tool === "compress" && (
					<Field label="Target size">
						<div className="flex gap-1">
							{[8, 16, 25, 50, 100].map((mb) => (
								<button key={mb} type="button" onClick={() => setTargetMb(mb)}
									className={cn("flex-1 rounded border py-1 text-xs", targetMb === mb && "border-primary bg-primary/10")}>
									{mb} MB
								</button>
							))}
						</div>
					</Field>
				)}
				{file && <p className="text-muted-foreground text-xs">Source: {formatBytes(files.reduce((n, f) => n + f.size, 0))}</p>}
				{busy && (
					<div className="bg-muted h-2 overflow-hidden rounded-full">
						<div className="bg-primary h-full transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
					</div>
				)}
				{result && (
					<div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm" data-quick-result>
						<span className="truncate font-medium">{result.path.split(/[\\/]/).pop()}</span>
						<span className="text-muted-foreground text-xs">{formatBytes(result.bytes)}</span>
						<Button size="sm" variant="outline" onClick={() => void window.worksuite?.files?.show(result.path)}>
							<FolderOpen /> Show in folder
						</Button>
					</div>
				)}
				<Button className="mt-auto h-11 font-bold" disabled={busy || !file || !tools || (tool === "merge" && files.length < 2)} onClick={() => void run()} data-quick-run>
					{busy ? "Working…" : spec.label}
				</Button>
			</aside>
		</div>
	);
}
