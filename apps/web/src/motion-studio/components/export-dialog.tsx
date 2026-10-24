"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { downloadBlob, exportMotion, FORMAT_INFO, type MotionExportFormat, type MotionExportOptions } from "../export";
import type { MotionProject } from "../model";

const FORMATS: MotionExportFormat[] = ["lottie", "dotlottie", "gif", "mp4", "webm", "png", "svg"];
const QUALITIES = ["low", "medium", "high"] as const;

/** Export settings and progress. */
export function ExportDialog({ project, time, onClose }: { project: MotionProject; time: number; onClose: () => void }) {
	const [options, setOptions] = useState<MotionExportOptions>({
		format: "lottie",
		scale: 1,
		fps: project.fps,
		duration: project.duration,
		repeats: 1,
		transparent: !project.background,
		quality: "high",
		loop: true,
	});
	const [progress, setProgress] = useState<number | null>(null);
	const abort = useRef<AbortController | null>(null);
	const set = (patch: Partial<MotionExportOptions>) => setOptions((o) => ({ ...o, ...patch }));
	const raster = !["lottie", "dotlottie", "svg"].includes(options.format);
	const run = async () => {
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		try {
			const blob = await exportMotion({ project, options, time, onProgress: setProgress, signal: controller.signal });
			const base = project.name.replace(/[^\w\- ]+/g, "").trim() || "motion";
			downloadBlob({ blob, name: `${base}.${FORMAT_INFO[options.format].ext}` });
			toast.success(`Exported ${FORMAT_INFO[options.format].label}`);
			onClose();
		} catch (error) {
			if (!controller.signal.aborted)
				toast.error("Export failed", { description: error instanceof Error ? error.message : String(error) });
		} finally {
			setProgress(null);
		}
	};
	const row = "flex items-center gap-2 text-xs";
	const label = "text-muted-foreground w-24 shrink-0";
	const input = "bg-muted/50 h-7 flex-1 border px-2";
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-motion-export>
			<div className="bg-background flex w-[420px] flex-col gap-3 border p-4 shadow-xl">
				<div className="flex items-center">
					<h2 className="flex-1 text-sm font-semibold">Export animation</h2>
					<button type="button" aria-label="Close" onClick={onClose} disabled={progress !== null}>
						<X className="size-4" />
					</button>
				</div>
				<label className={row}>
					<span className={label}>Format</span>
					<select value={options.format} onChange={(e) => set({ format: FORMATS.find((f) => f === e.target.value) ?? "lottie" })} className={input} data-motion-export-format>
						{FORMATS.map((f) => (
							<option key={f} value={f}>
								{FORMAT_INFO[f].label}
							</option>
						))}
					</select>
				</label>
				<p className="text-muted-foreground text-[11px]">{FORMAT_INFO[options.format].note}</p>
				{raster && (
					<>
						<label className={row}>
							<span className={label}>Resolution</span>
							<select value={options.scale} onChange={(e) => set({ scale: Number(e.target.value) })} className={input}>
								{[0.25, 0.5, 1, 2].map((s) => (
									<option key={s} value={s}>
										{Math.round(project.width * s)} × {Math.round(project.height * s)}
									</option>
								))}
							</select>
						</label>
						<label className={row}>
							<span className={label}>Frame rate</span>
							<select value={options.fps} onChange={(e) => set({ fps: Number(e.target.value) })} className={input}>
								{[...new Set([12, 15, 24, 25, 30, 50, 60, project.fps])].sort((a, b) => a - b).map((f) => (
									<option key={f} value={f}>
										{f} fps
									</option>
								))}
							</select>
						</label>
						<label className={row}>
							<span className={label}>Length</span>
							<input
								type="number"
								min={0.1}
								max={project.duration}
								step={0.1}
								value={options.duration}
								onChange={(e) => set({ duration: Math.min(project.duration, Math.max(0.1, Number(e.target.value) || project.duration)) })}
								className={input}
							/>
							<span className="text-muted-foreground">s</span>
						</label>
						{(options.format === "mp4" || options.format === "webm") && (
							<>
								<label className={row}>
									<span className={label}>Play</span>
									<select value={options.repeats} onChange={(e) => set({ repeats: Number(e.target.value) })} className={input}>
										{[1, 2, 3, 5, 10].map((n) => (
											<option key={n} value={n}>
												{n === 1 ? "Once" : `${n} times (loop)`}
											</option>
										))}
									</select>
								</label>
								<label className={row}>
									<span className={label}>Quality</span>
									<select value={options.quality} onChange={(e) => set({ quality: QUALITIES.find((q) => q === e.target.value) ?? "high" })} className={input}>
										<option value="low">Low (small file)</option>
										<option value="medium">Medium</option>
										<option value="high">High</option>
									</select>
								</label>
							</>
						)}
						{options.format === "gif" && (
							<label className={row}>
								<input type="checkbox" checked={options.loop} onChange={(e) => set({ loop: e.target.checked })} />
								Loop forever
							</label>
						)}
						{options.format !== "mp4" && (
							<label className={row}>
								<input type="checkbox" checked={options.transparent} onChange={(e) => set({ transparent: e.target.checked })} data-motion-export-transparent />
								Transparent background {project.background ? "(the canvas has a background colour)" : ""}
							</label>
						)}
					</>
				)}
				{progress !== null && (
					<div className="bg-muted h-1.5 w-full" aria-label="Export progress">
						<div className="bg-primary h-full" style={{ width: `${Math.round(progress * 100)}%` }} />
					</div>
				)}
				<div className="flex justify-end gap-2">
					{progress !== null ? (
						<button type="button" className="border px-3 py-1.5 text-xs" onClick={() => abort.current?.abort()}>
							Cancel
						</button>
					) : (
						<button type="button" className="bg-primary text-primary-foreground px-3 py-1.5 text-xs" onClick={() => void run()} data-motion-export-run>
							Export
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
