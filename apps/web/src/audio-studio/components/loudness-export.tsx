"use client";

import { Download, Gauge } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { audioFormatInfo, type AudioExportFormat } from "@/export/audio-export";
import { cn } from "@/utils/ui";
import { formatLufs, LOUDNESS_TARGETS, type LoudnessReport, measureBuffer } from "../loudness";
import { encodeMaster, masterToTarget, renderMix, saveFile, stemTracks } from "../master";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loudness of the whole mix to BS.1770 / EBU R128 (AE-07). */
export function LoudnessCard() {
	const editor = useEditor();
	const [report, setReport] = useState<LoudnessReport | null>(null);
	const [busy, setBusy] = useState(false);
	const [target, setTarget] = useState<number>(-16);
	const measure = async () => {
		setBusy(true);
		try {
			setReport(measureBuffer(await renderMix({ editor })));
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const off = report && Number.isFinite(report.integrated) ? report.integrated - target : null;
	return (
		<div className="bg-panel flex flex-col gap-1.5 rounded-md border p-2 text-xs" data-studio-loudness-card>
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Loudness</span>
				<select className="rounded border bg-transparent px-1 text-[11px]" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target">
					{LOUDNESS_TARGETS.map((t) => (
						<option key={t.id} value={t.lufs}>
							{t.label} {t.lufs}
						</option>
					))}
				</select>
			</div>
			<div className="grid grid-cols-3 gap-1 text-center">
				{(
					[
						["LUFS", report ? formatLufs(report.integrated) : "–"],
						["dBTP", report ? formatLufs(report.truePeak) : "–"],
						["LU range", report ? report.range.toFixed(1) : "–"],
					] as const
				).map(([label, value]) => (
					<div key={label} className="bg-muted/50 rounded py-1">
						<div className="font-mono text-base tabular-nums" data-loudness-value={label}>
							{value}
						</div>
						<div className="text-muted-foreground text-[10px]">{label}</div>
					</div>
				))}
			</div>
			<span className={cn("text-[11px]", off === null ? "text-muted-foreground" : Math.abs(off) <= 1 ? "text-emerald-400" : "text-amber-400")}>
				{off === null
					? "Integrated loudness of the full mix."
					: Math.abs(off) <= 1
						? "On target."
						: `${Math.abs(off).toFixed(1)} LU ${off > 0 ? "too loud" : "too quiet"}; export targets fix this.`}
				{report && report.truePeak > -1 ? " Peaks over −1 dBTP." : ""}
			</span>
			<Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void measure()} data-studio-measure>
				<Gauge className="size-3.5" /> {busy ? "Measuring…" : "Measure mix"}
			</Button>
		</div>
	);
}

/** Export targets (AE-09): loudness-matched masters of the mix or stems. */
export function ExportTargetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const editor = useEditor();
	const [targetId, setTargetId] = useState<string>("podcast");
	const [custom, setCustom] = useState({ lufs: -16, peak: -1, format: "mp3" as AudioExportFormat, mono: false });
	const [what, setWhat] = useState<"mix" | "stems">("mix");
	const [busy, setBusy] = useState<string | null>(null);
	const [done, setDone] = useState<{ name: string; before: number; after: number; peak: number }[]>([]);
	const preset = LOUDNESS_TARGETS.find((t) => t.id === targetId);
	const spec = preset
		? { lufs: preset.lufs, peak: preset.peak, format: preset.format as AudioExportFormat, mono: preset.channels === 1 }
		: custom;

	const run = async () => {
		setDone([]);
		const project = editor.project.getActive().metadata.name;
		const tracks = editor.scenes.getActiveScene().tracks;
		const jobs = what === "mix" ? [{ name: project, tracks }] : stemTracks(tracks).map((s) => ({ name: `${project} - ${s.name}`, tracks: s.tracks }));
		const { extension, mimeType } = audioFormatInfo(spec.format);
		try {
			for (const job of jobs) {
				setBusy(job.name);
				const mix = await renderMix({ editor, tracks: job.tracks, channels: spec.mono ? 1 : 2 });
				if (what === "stems" && !Number.isFinite(measureBuffer(mix).integrated)) continue;
				const { buffer, before, after } = await masterToTarget({ buffer: mix, lufs: spec.lufs, peak: spec.peak });
				const data = await encodeMaster({ buffer, format: spec.format, bitrate: spec.mono ? 96_000 : 192_000 });
				const name = `${job.name}${extension}`;
				if (!(await saveFile({ name, data, mimeType }))) break;
				setDone((d) => [...d, { name, before: before.integrated, after: after.integrated, peak: after.truePeak }]);
			}
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			setBusy(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg" data-studio-export>
				<DialogHeader>
					<DialogTitle>Export audio</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 p-4 text-sm">
					<div className="grid grid-cols-2 gap-1.5">
						{[...LOUDNESS_TARGETS, { id: "custom", label: "Custom", note: "Your own target" }].map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => setTargetId(t.id)}
								data-export-target={t.id}
								className={cn("rounded-md border p-2 text-left", targetId === t.id ? "border-primary bg-primary/10" : "hover:bg-accent")}
							>
								<div className="font-semibold">{t.label}</div>
								<div className="text-muted-foreground text-xs">{t.note}</div>
							</button>
						))}
					</div>
					{!preset && (
						<div className="grid grid-cols-4 gap-2 text-xs">
							<label className="flex flex-col gap-1">
								LUFS
								<input type="number" className="rounded border bg-transparent p-1" value={custom.lufs} onChange={(e) => setCustom({ ...custom, lufs: Number(e.target.value) })} />
							</label>
							<label className="flex flex-col gap-1">
								Peak dBTP
								<input type="number" className="rounded border bg-transparent p-1" value={custom.peak} onChange={(e) => setCustom({ ...custom, peak: Number(e.target.value) })} />
							</label>
							<label className="flex flex-col gap-1">
								Format
								<select className="rounded border bg-transparent p-1" value={custom.format} onChange={(e) => setCustom({ ...custom, format: e.target.value === "wav" ? "wav" : e.target.value === "m4a" ? "m4a" : "mp3" })}>
									<option value="mp3">MP3</option>
									<option value="m4a">AAC</option>
									<option value="wav">WAV</option>
								</select>
							</label>
							<label className="flex items-end gap-1 pb-1">
								<input type="checkbox" checked={custom.mono} onChange={(e) => setCustom({ ...custom, mono: e.target.checked })} /> Mono
							</label>
						</div>
					)}
					<div className="flex gap-2 text-xs">
						{(["mix", "stems"] as const).map((w) => (
							<button key={w} type="button" onClick={() => setWhat(w)} className={cn("flex-1 rounded border py-1.5", what === w && "border-primary bg-primary/10")} data-export-what={w}>
								{w === "mix" ? "Full mix" : "Stems (one file per track)"}
							</button>
						))}
					</div>
					{done.length > 0 && (
						<ul className="flex flex-col gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs" data-export-done>
							{done.map((d) => (
								<li key={d.name}>
									<b>{d.name}</b> · {formatLufs(d.before)} → {formatLufs(d.after)} LUFS · peak {formatLufs(d.peak)} dBTP
								</li>
							))}
						</ul>
					)}
					<Button disabled={!!busy} onClick={() => void run()} data-export-run>
						<Download /> {busy ? `Exporting ${busy}…` : `Export ${spec.lufs} LUFS ${spec.format.toUpperCase()}`}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
