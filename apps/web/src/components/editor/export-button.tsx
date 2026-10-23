"use client";

import { finishSphereExport, SPHERE_EXPORT_PRESETS } from "@/vr/export";
import { useSphereStore } from "@/vr/store";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { canEncodeVideo } from "mediabunny";
import {
	Check,
	Copy,
	Download,
	FolderOpen,
	RotateCcw,
	Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/ui";
import {
	downloadBuffer,
	getExportFileExtension,
	getExportMimeType,
	EXPORT_CODEC_VALUES,
	type ExportCodec,
	type ExportQuality,
} from "@/export";
import { captionTracksToCues, cuesToSrt } from "@/export/captions";
import {
	EXPORT_CODEC_LABELS,
	EXPORT_PRESETS,
	estimateExportBytes,
	evenSize,
	formatBytes,
	formatForCodec,
} from "@/export/presets";
import { useEditor } from "@/editor/use-editor";
import {
	ShareOptions,
	ShareProgress,
	type ShareSettings,
} from "@/export/components/share-panel";
import { floatToFrameRate, frameRateToFloat } from "@/fps/utils";
import { TICKS_PER_SECOND } from "@/wasm";

export function ExportButton() {
	const [open, setOpen] = useState(false);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const hasProject = !!activeProject;

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setOpen(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<button
				type="button"
				className={cn(
					"inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white",
					"bg-linear-to-b from-[#4C8DFF] to-[#2F6BF0] shadow-[0_1px_2px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]",
					"transition-[filter,transform] hover:brightness-110 active:translate-y-px active:brightness-95",
					"focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
					!hasProject && "pointer-events-none opacity-50",
				)}
				onClick={hasProject ? () => setOpen(true) : undefined}
				disabled={!hasProject}
			>
				<Upload className="size-4" strokeWidth={2.25} />
				Export
			</button>
			{hasProject && open && (
				<ExportDialog onClose={() => handleOpenChange(false)} />
			)}
		</Dialog>
	);
}

function Pill({
	active,
	disabled,
	title,
	onClick,
	children,
}: {
	active: boolean;
	disabled?: boolean;
	title?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			title={title}
			onClick={onClick}
			className={cn(
				"rounded-md border px-3 py-1 text-xs",
				active
					? "border-primary bg-primary/15 text-foreground"
					: "text-muted-foreground hover:bg-accent",
				disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
			)}
		>
			{children}
		</button>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<div className="flex flex-wrap items-center gap-1.5">{children}</div>
		</div>
	);
}

const supportedNone: Record<ExportCodec, boolean> = {
	avc: false,
	hevc: false,
	av1: false,
	vp9: false,
};

function CheckRow({
	id,
	checked,
	onChange,
	children,
}: {
	id: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center gap-2">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(v) => onChange(!!v)}
			/>
			<Label htmlFor={id} className="text-xs font-normal">
				{children}
			</Label>
		</div>
	);
}

function formatDuration(seconds: number) {
	const total = Math.round(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const QUALITY_CHOICES: { value: ExportQuality; label: string }[] = [
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "very_high", label: "Very high" },
];

function ExportDialog({ onClose }: { onClose: () => void }) {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const { isExporting, progress, result } = exportState;

	const projectSize = project.settings.canvasSize;
	const projectFps = frameRateToFloat(project.settings.fps);
	const durationSeconds = editor.timeline.getTotalDuration() / TICKS_PER_SECOND;
	const captionCount = useMemo(
		() =>
			captionTracksToCues([...tracks.overlay, tracks.main, ...tracks.audio])
				.length,
		[tracks],
	);

	const [fileName, setFileName] = useState(project.metadata.name);
	const [preset, setPreset] = useState<string>("project");
	const [custom, setCustom] = useState({ ...projectSize });
	const [fps, setFps] = useState(projectFps);
	const [codec, setCodec] = useState<ExportCodec>("avc");
	const [quality, setQuality] = useState<ExportQuality>("high");
	const [includeAudio, setIncludeAudio] = useState(true);
	const [burnIn, setBurnIn] = useState(true);
	const [embed, setEmbed] = useState(false);
	const [saveSrt, setSaveSrt] = useState(false);
	const [supported, setSupported] = useState<Record<ExportCodec, boolean>>({
		avc: true,
		hevc: true,
		av1: true,
		vp9: true,
	});
	const [savedPath, setSavedPath] = useState<string | null>(null);
	const [share, setShare] = useState<ShareSettings>({
		enabled: false,
		expiresInDays: 7,
		allowDownload: true,
	});
	// Settings frozen at export time, so editing them doesn't restart an upload.
	const [sharing, setSharing] = useState<ShareSettings | null>(null);

	const sphereProject = useSphereStore(
		(s) => !!s.sphereProjects[project.metadata.id],
	);
	const presets = sphereProject ? SPHERE_EXPORT_PRESETS : EXPORT_PRESETS;
	const size = evenSize(
		preset === "project"
			? projectSize
			: preset === "custom"
				? custom
				: (presets.find((p) => p.id === preset) ?? projectSize),
	);
	const format = formatForCodec(codec);
	const aspectDiffers =
		Math.abs(
			size.width / size.height - projectSize.width / projectSize.height,
		) > 0.01;

	// Not every machine can encode every codec at every size (SRS ED-09).
	useEffect(() => {
		let cancelled = false;
		Promise.all(
			EXPORT_CODEC_VALUES.map(async (c) => {
				try {
					return [c, await canEncodeVideo(c, size)] as const;
				} catch {
					return [c, false] as const;
				}
			}),
		).then((entries) => {
			if (cancelled) return;
			const next = { ...supportedNone };
			for (const [c, ok] of entries) next[c] = ok;
			setSupported(next);
			setCodec((current) =>
				next[current]
					? current
					: (EXPORT_CODEC_VALUES.find((c) => next[c]) ?? "avc"),
			);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- size is rebuilt each render
	}, [size.width, size.height]);

	const estimate = estimateExportBytes({
		...size,
		fps,
		seconds: durationSeconds,
		quality,
		codec,
		includeAudio,
	});
	const isDesktop = typeof window !== "undefined" && !!window.worksuite?.files;

	const handleExport = async () => {
		setSavedPath(null);
		setSharing(null);
		const exportResult = await editor.project.export({
			options: {
				format,
				codec,
				quality,
				fps: fps === projectFps ? project.settings.fps : floatToFrameRate(fps),
				includeAudio,
				resolution: size,
				burnInCaptions: burnIn,
				embedCaptions: embed,
			},
		});
		if (exportResult.cancelled) {
			editor.project.clearExportState();
			return;
		}
		if (!exportResult.success || !exportResult.buffer) return;
		if (sphereProject) {
			exportResult.buffer = finishSphereExport({
				buffer: exportResult.buffer,
				format,
				...size,
			});
		}

		const name = `${fileName.trim() || project.metadata.name}${getExportFileExtension({ format })}`;
		const srt =
			saveSrt && exportResult.captions?.length
				? cuesToSrt(exportResult.captions)
				: null;
		const files = window.worksuite?.files;
		if (files) {
			const saved = await files.saveExport({
				suggestedName: name,
				data: exportResult.buffer,
				sideFiles: srt ? [{ suffix: ".srt", content: srt }] : [],
			});
			editor.project.clearExportState();
			if (saved.saved && saved.path) {
				setSavedPath(saved.path);
				if (share.enabled) setSharing({ ...share });
				toast.success("Export saved");
			}
			return;
		}
		downloadBuffer({
			buffer: exportResult.buffer,
			filename: name,
			mimeType: getExportMimeType({ format }),
		});
		if (srt) {
			downloadBuffer({
				buffer: new TextEncoder().encode(srt).buffer,
				filename: name.replace(/\.[^.]+$/, ".srt"),
				mimeType: "application/x-subrip",
			});
		}
		editor.project.clearExportState();
		onClose();
	};

	if (result && !result.success && !result.cancelled) {
		return (
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Export failed</DialogTitle>
				</DialogHeader>
				<ExportError
					error={result.error || "Unknown error occurred"}
					onRetry={handleExport}
				/>
			</DialogContent>
		);
	}

	return (
		<DialogContent className="max-w-2xl" aria-describedby={undefined}>
			<DialogHeader className="py-4">
				<DialogTitle>{isExporting ? "Exporting…" : "Export"}</DialogTitle>
			</DialogHeader>
			<DialogBody className="min-w-0 gap-3 py-4">
				{isExporting ? (
					<div className="flex flex-col gap-2 py-6">
						<div className="text-muted-foreground flex justify-between text-sm">
							<span>
								{size.width} × {size.height} · {EXPORT_CODEC_LABELS[codec]} ·{" "}
								{fps} fps
							</span>
							<span>{Math.round(progress * 100)}%</span>
						</div>
						<Progress value={progress * 100} />
					</div>
				) : (
					<>
						<div className="flex flex-col gap-1">
							<Label htmlFor="export-name" className="text-xs">
								File name
							</Label>
							<Input
								id="export-name"
								value={fileName}
								onChange={(e) => setFileName(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs" data-export-summary>
								Duration {formatDuration(durationSeconds)} · Estimated size{" "}
								{formatBytes(estimate)}
								{isDesktop ? " · Saving to Videos/Worksuite" : ""}
							</p>
						</div>

						<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
							{[
								{
									id: "project",
									label: "Project",
									detail: `${projectSize.width} × ${projectSize.height}`,
								},
								...presets.map((p) => ({
									id: p.id,
									label: p.label,
									detail: `${p.width} × ${p.height}`,
								})),
								{ id: "custom", label: "Custom", detail: "Any size" },
							].map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => setPreset(p.id)}
									className={cn(
										"flex flex-col items-start rounded-md border p-2 text-left",
										preset === p.id
											? "border-primary bg-primary/10"
											: "hover:bg-accent",
									)}
								>
									<span className="text-xs font-medium">{p.label}</span>
									<span className="text-muted-foreground text-[11px]">
										{p.detail}
									</span>
								</button>
							))}
						</div>

						<Row label="Resolution">
							{preset === "custom" ? (
								<>
									<Input
										type="number"
										className="h-7 w-24"
										value={custom.width}
										onChange={(e) =>
											setCustom((c) => ({
												...c,
												width: Math.min(
													7680,
													Math.max(2, Number(e.target.value) || 2),
												),
											}))
										}
									/>
									<span className="text-muted-foreground text-xs">×</span>
									<Input
										type="number"
										className="h-7 w-24"
										value={custom.height}
										onChange={(e) =>
											setCustom((c) => ({
												...c,
												height: Math.min(
													4320,
													Math.max(2, Number(e.target.value) || 2),
												),
											}))
										}
									/>
								</>
							) : (
								<span className="text-xs">
									{size.width} × {size.height}
								</span>
							)}
							{aspectDiffers && (
								<span className="text-muted-foreground text-[11px]">
									Different shape from the project — it will be letterboxed.
								</span>
							)}
						</Row>
						<Row label="Frame rate">
							{[...new Set([projectFps, 24, 30, 60])]
								.sort((a, b) => a - b)
								.map((value) => (
									<Pill
										key={value}
										active={fps === value}
										onClick={() => setFps(value)}
									>
										{Number(value.toFixed(3))} fps
										{value === projectFps ? " (project)" : ""}
									</Pill>
								))}
						</Row>
						<Row label="Codec">
							{EXPORT_CODEC_VALUES.map((c) => (
								<Pill
									key={c}
									active={codec === c}
									disabled={!supported[c]}
									title={
										supported[c]
											? `${EXPORT_CODEC_LABELS[c]} in ${formatForCodec(c).toUpperCase()}`
											: `This computer can't encode ${EXPORT_CODEC_LABELS[c]} at ${size.width} × ${size.height}`
									}
									onClick={() => setCodec(c)}
								>
									{EXPORT_CODEC_LABELS[c]}
								</Pill>
							))}
						</Row>
						<Row label="Quality">
							{QUALITY_CHOICES.map((q) => (
								<Pill
									key={q.value}
									active={quality === q.value}
									onClick={() => setQuality(q.value)}
								>
									{q.label}
								</Pill>
							))}
						</Row>
						<Row label="Audio">
							<CheckRow
								id="export-includeAudio"
								checked={includeAudio}
								onChange={setIncludeAudio}
							>
								Include audio
							</CheckRow>
						</Row>

						{captionCount > 0 && (
							<div className="flex flex-col gap-1.5 rounded-md border p-3">
								<span className="text-xs font-medium">Subtitles</span>
								<CheckRow
									id="export-burnIn"
									checked={burnIn}
									onChange={setBurnIn}
								>
									Burn in ({captionCount} caption track
									{captionCount === 1 ? "" : "s"})
								</CheckRow>
								<CheckRow id="export-embed" checked={embed} onChange={setEmbed}>
									Separate track in the video file
								</CheckRow>
								<CheckRow
									id="export-saveSrt"
									checked={saveSrt}
									onChange={setSaveSrt}
								>
									Also save .srt file (UTF-8)
								</CheckRow>
							</div>
						)}

						<ShareOptions settings={share} onChange={setShare} />

						{savedPath && (
							<div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs">
								<span className="min-w-0 truncate" title={savedPath}>
									Saved to {savedPath}
								</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() => window.worksuite?.files?.show(savedPath)}
								>
									<FolderOpen />
									Show in folder
								</Button>
							</div>
						)}
						{savedPath && sharing && (
							<ShareProgress filePath={savedPath} settings={sharing} />
						)}
					</>
				)}
			</DialogBody>
			<DialogFooter className="gap-2 py-4">
				{isExporting ? (
					<Button
						variant="outline"
						onClick={() => editor.project.cancelExport()}
					>
						Cancel export
					</Button>
				) : (
					<>
						<Button variant="outline" onClick={onClose}>
							{savedPath ? "Close" : "Cancel"}
						</Button>
						<Button onClick={handleExport} className="gap-2">
							<Download className="size-4" />
							Export video
						</Button>
					</>
				)}
			</DialogFooter>
		</DialogContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">Export failed</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copy
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Retry
				</Button>
			</div>
		</div>
	);
}
