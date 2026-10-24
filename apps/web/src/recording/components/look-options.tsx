"use client";

import { cn } from "@/utils/ui";
import { type CameraCorner, type CameraShape, DEFAULT_CAMERA_OVERLAY, useRecordingSettings } from "../settings";

const SHAPES: [CameraShape, string, string][] = [
	["circle", "Circle", "rounded-full"],
	["rounded", "Rounded", "rounded-md"],
	["square", "Square", "rounded-none"],
	["original", "Original", "rounded-none aspect-video"],
];
const CORNERS: [CameraCorner, string][] = [
	["top-left", "↖"],
	["top-right", "↗"],
	["bottom-left", "↙"],
	["bottom-right", "↘"],
];
const ZOOMS = [1.5, 2, 2.5, 3];
const COLORS = ["#ffc400", "#4c8dff", "#ef4444", "#22c55e", "#ffffff"];

function Segment<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
	return (
		<div className="flex gap-1" role="radiogroup" aria-label={label}>
			{options.map(([v, text]) => (
				<button
					key={String(v)}
					type="button"
					role="radio"
					aria-checked={value === v}
					onClick={() => onChange(v)}
					className={cn("flex-1 border px-2 py-1 text-xs", value === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/50")}
				>
					{text}
				</button>
			))}
		</div>
	);
}

/** Smart zoom, camera overlay and cursor/click highlight choices for screen recordings. */
export function RecordingLookOptions({ camera = true }: { camera?: boolean }) {
	const s = useRecordingSettings();
	const cam = { ...DEFAULT_CAMERA_OVERLAY, ...s.camera };
	const setCam = (patch: Partial<typeof cam>) => s.set({ camera: { ...cam, ...patch } });
	return (
		<div className="flex flex-col gap-3 text-sm" data-recording-look>
			<section className="flex flex-col gap-2">
				<h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Smart zoom</h4>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={s.autoZoom} onChange={(e) => s.set({ autoZoom: e.target.checked })} />
					Zoom in on clicks and typing
				</label>
				{s.autoZoom && (
					<>
						<Segment label="Zoom strength" value={s.zoomLevel ?? 2} options={ZOOMS.map((z) => [z, `${z}×`])} onChange={(zoomLevel) => s.set({ zoomLevel })} />
						<label className="flex items-center gap-2">
							<input type="checkbox" checked={s.zoomFollow ?? true} onChange={(e) => s.set({ zoomFollow: e.target.checked })} />
							Follow the mouse while zoomed
						</label>
					</>
				)}
			</section>

			{camera && (
				<section className="flex flex-col gap-2" data-camera-overlay>
					<h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Camera overlay</h4>
					<div className="flex gap-2">
						{SHAPES.map(([id, label, shape]) => (
							<button
								key={id}
								type="button"
								onClick={() => setCam({ shape: id })}
								className={cn("flex flex-1 flex-col items-center gap-1 border p-2 text-xs", cam.shape === id ? "border-primary bg-primary/10" : "hover:bg-muted/50")}
							>
								<span className={cn("bg-muted-foreground/60 h-7 w-7 border-2 border-white/80", shape, id === "original" && "w-12")} />
								{label}
							</button>
						))}
					</div>
					<label className="flex items-center gap-3">
						<span className="w-16 shrink-0">Size</span>
						<input type="range" min={10} max={50} value={cam.size} onChange={(e) => setCam({ size: Number(e.target.value) })} className="flex-1" />
						<span className="w-10 text-right tabular-nums">{cam.size}%</span>
					</label>
					<label className="flex items-center gap-3">
						<span className="w-16 shrink-0">Border</span>
						<input type="range" min={0} max={12} value={cam.border} onChange={(e) => setCam({ border: Number(e.target.value) })} className="flex-1" />
						<span className="w-10 text-right tabular-nums">{cam.border}px</span>
					</label>
					<div className="flex items-center gap-3">
						<span className="w-16 shrink-0">Position</span>
						<div className="flex-1">
							<Segment label="Camera position" value={cam.corner} options={CORNERS} onChange={(corner) => setCam({ corner })} />
						</div>
					</div>
					<p className="text-muted-foreground m-0 text-xs">You can still move, resize and reshape it in the editor (Mask tab).</p>
				</section>
			)}

			<section className="flex flex-col gap-2">
				<h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Cursor &amp; clicks</h4>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={s.cursorHalo ?? false} onChange={(e) => s.set({ cursorHalo: e.target.checked })} data-cursor-halo />
					Highlight the mouse as it moves
				</label>
				<div className="flex items-center gap-3">
					<span className="w-16 shrink-0">Click colour</span>
					<div className="flex gap-1.5">
						{COLORS.map((c) => (
							<button
								key={c}
								type="button"
								aria-label={c}
								onClick={() => s.set({ clickColor: c })}
								className={cn("size-6 rounded-full border-2", (s.clickColor ?? COLORS[0]) === c ? "border-primary" : "border-transparent")}
								style={{ background: c }}
							/>
						))}
					</div>
				</div>
				<label className="flex items-center gap-3">
					<span className="w-16 shrink-0">Click size</span>
					<input type="range" min={32} max={120} value={s.clickSize ?? 56} onChange={(e) => s.set({ clickSize: Number(e.target.value) })} className="flex-1" />
					<span className="w-10 text-right tabular-nums">{s.clickSize ?? 56}px</span>
				</label>
			</section>
		</div>
	);
}
