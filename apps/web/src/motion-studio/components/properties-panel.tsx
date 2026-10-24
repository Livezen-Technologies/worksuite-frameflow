"use client";

import { Diamond } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/ui";
import { editProp, removeKeyframe, setKeyframe, valueAt, type AnimProp, type Layer, type MotionProject } from "../model";
import { useStudio } from "../store";
import { projectColors, projectFonts, replaceColor, replaceFont } from "../templates";

function NumberField({
	label,
	value,
	onChange,
	step = 1,
	min,
	max,
	suffix,
	field,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	step?: number;
	min?: number;
	max?: number;
	suffix?: string;
	field?: string;
}) {
	// While typing, the draft is shown; otherwise the live value.
	const [draft, setDraft] = useState<string | null>(null);
	const text = draft ?? String(Math.round(value * 1000) / 1000);
	const commit = () => {
		const v = Number(text);
		setDraft(null);
		if (draft === null || !Number.isFinite(v)) return;
		onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
	};
	return (
		<label className="flex min-w-0 items-center gap-1 text-[11px]">
			<span className="text-muted-foreground w-14 shrink-0">{label}</span>
			<input
				type="number"
				step={step}
				value={text}
				data-motion-field={field}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
				className="bg-muted/50 h-6 min-w-0 flex-1 border px-1.5 tabular-nums"
			/>
			{suffix && <span className="text-muted-foreground w-3">{suffix}</span>}
		</label>
	);
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
	return (
		<label className="flex items-center gap-1 text-[11px]">
			<span className="text-muted-foreground w-14 shrink-0">{label}</span>
			<input type="color" value={value ?? "#000000"} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 border bg-transparent" />
			<input
				type="text"
				value={value ?? "none"}
				onChange={(e) => onChange(e.target.value === "none" || !e.target.value ? null : e.target.value)}
				className="bg-muted/50 h-6 min-w-0 flex-1 border px-1.5"
			/>
		</label>
	);
}

const PROP_FIELDS: Array<{ prop: AnimProp; label: string; step?: number; min?: number; max?: number; scale?: number; suffix?: string }> = [
	{ prop: "x", label: "X" },
	{ prop: "y", label: "Y" },
	{ prop: "scale", label: "Scale", step: 1, min: 1, scale: 100, suffix: "%" },
	{ prop: "rotation", label: "Rotation", suffix: "°" },
	{ prop: "opacity", label: "Opacity", step: 1, min: 0, max: 100, scale: 100, suffix: "%" },
];

function LayerProps({ layer }: { layer: Layer }) {
	const time = useStudio((s) => s.time);
	const { updateLayer } = useStudio.getState();
	const update = (fn: (l: Layer) => Layer) => updateLayer({ id: layer.id, update: fn });
	return (
		<div className="flex flex-col gap-3" data-motion-properties>
			<input
				value={layer.name}
				onChange={(e) => update((l) => ({ ...l, name: e.target.value }))}
				className="bg-muted/50 h-7 border px-2 text-xs font-medium"
				aria-label="Layer name"
			/>
			<section className="flex flex-col gap-1.5">
				<h3 className="text-muted-foreground text-[10px] font-semibold uppercase">Transform</h3>
				{PROP_FIELDS.map(({ prop, label, step, min, max, scale = 1, suffix }) => {
					const keys = layer.keyframes[prop] ?? [];
					const onKey = keys.some((k) => Math.abs(k.t - time) < 1e-6);
					const v = valueAt({ layer, prop, t: time });
					return (
						<div key={prop} className="flex items-center gap-1">
							<button
								type="button"
								title={onKey ? "Remove keyframe" : "Add keyframe here"}
								aria-label={`${onKey ? "Remove" : "Add"} ${label} keyframe`}
								data-motion-key={prop}
								onClick={() =>
									update((l) => (onKey ? removeKeyframe({ layer: l, prop, t: time }) : setKeyframe({ layer: l, prop, t: time, v })))
								}
								className={cn("shrink-0", keys.length ? "text-[#F59E0B]" : "text-muted-foreground")}
							>
								<Diamond className="size-3" fill={onKey ? "currentColor" : "none"} />
							</button>
							<div className="min-w-0 flex-1">
								<NumberField
									label={label}
									field={prop}
									value={Math.round(v * scale * 100) / 100}
									step={step}
									min={min}
									max={max}
									suffix={suffix}
									onChange={(n) => update((l) => editProp({ layer: l, prop, t: time, v: n / scale }))}
								/>
							</div>
						</div>
					);
				})}
				<div className="flex flex-col gap-1.5 pl-4">
					<NumberField label="Anchor X" value={Math.round(layer.anchorX * 100)} suffix="%" onChange={(n) => update((l) => ({ ...l, anchorX: n / 100 }))} />
					<NumberField label="Anchor Y" value={Math.round(layer.anchorY * 100)} suffix="%" onChange={(n) => update((l) => ({ ...l, anchorY: n / 100 }))} />
				</div>
			</section>
			<section className="flex flex-col gap-1.5">
				<h3 className="text-muted-foreground text-[10px] font-semibold uppercase">Appearance</h3>
				{(layer.kind === "rect" || layer.kind === "ellipse" || layer.kind === "image") && (
					<>
						<NumberField label="Width" field="w" value={layer.w} min={1} onChange={(n) => update((l) => ("w" in l ? { ...l, w: n } : l))} />
						<NumberField label="Height" field="h" value={layer.h} min={1} onChange={(n) => update((l) => ("h" in l ? { ...l, h: n } : l))} />
					</>
				)}
				{layer.kind === "rect" && (
					<NumberField label="Corners" value={layer.radius} min={0} onChange={(n) => update((l) => (l.kind === "rect" ? { ...l, radius: n } : l))} />
				)}
				{(layer.kind === "rect" || layer.kind === "ellipse" || layer.kind === "path") && (
					<>
						<ColorField label="Fill" value={layer.fill} onChange={(fill) => update((l) => ("strokeWidth" in l ? { ...l, fill } : l))} />
						<ColorField label="Stroke" value={layer.stroke} onChange={(stroke) => update((l) => ("strokeWidth" in l ? { ...l, stroke } : l))} />
						<NumberField label="Stroke w" value={layer.strokeWidth} min={0} onChange={(n) => update((l) => ("strokeWidth" in l ? { ...l, strokeWidth: n } : l))} />
					</>
				)}
				{layer.kind === "path" && (
					<label className="flex items-center gap-2 text-[11px]">
						<input type="checkbox" checked={layer.closed} onChange={(e) => update((l) => (l.kind === "path" ? { ...l, closed: e.target.checked } : l))} />
						Closed shape
						<button type="button" className="text-primary ml-auto" onClick={() => useStudio.getState().setEditingPath(layer.id)}>
							Edit points
						</button>
					</label>
				)}
				{layer.kind === "text" && (
					<>
						<textarea
							value={layer.text}
							rows={2}
							data-motion-text
							onChange={(e) => update((l) => (l.kind === "text" ? { ...l, text: e.target.value } : l))}
							className="bg-muted/50 border px-2 py-1 text-xs"
						/>
						<NumberField label="Size" value={layer.fontSize} min={1} onChange={(n) => update((l) => (l.kind === "text" ? { ...l, fontSize: n } : l))} />
						<NumberField label="Weight" value={layer.fontWeight} step={100} min={100} max={900} onChange={(n) => update((l) => (l.kind === "text" ? { ...l, fontWeight: n } : l))} />
						<label className="flex items-center gap-1 text-[11px]">
							<span className="text-muted-foreground w-14 shrink-0">Font</span>
							<input
								value={layer.fontFamily}
								onChange={(e) => update((l) => (l.kind === "text" ? { ...l, fontFamily: e.target.value } : l))}
								className="bg-muted/50 h-6 min-w-0 flex-1 border px-1.5"
							/>
						</label>
						<ColorField label="Colour" value={layer.fill} onChange={(fill) => update((l) => (l.kind === "text" ? { ...l, fill: fill ?? "#ffffff" } : l))} />
					</>
				)}
			</section>
		</div>
	);
}

function ProjectProps({ project }: { project: MotionProject }) {
	const { commit } = useStudio.getState();
	const set = (patch: Partial<MotionProject>) => commit((p) => ({ ...p, ...patch }));
	return (
		<div className="flex flex-col gap-1.5" data-motion-project-settings>
			<h3 className="text-muted-foreground text-[10px] font-semibold uppercase">Canvas</h3>
			<NumberField label="Width" value={project.width} min={16} max={7680} onChange={(width) => set({ width: Math.round(width) })} />
			<NumberField label="Height" value={project.height} min={16} max={7680} onChange={(height) => set({ height: Math.round(height) })} />
			<div className="flex flex-wrap gap-1 pl-15">
				{[
					["16:9", 1920, 1080],
					["9:16", 1080, 1920],
					["1:1", 1080, 1080],
					["4:5", 1080, 1350],
				].map(([label, width, height]) => (
					<button key={label} type="button" className="hover:bg-accent border px-1.5 text-[11px]" onClick={() => set({ width: Number(width), height: Number(height) })}>
						{label}
					</button>
				))}
			</div>
			<NumberField label="Frame rate" value={project.fps} min={1} max={120} onChange={(fps) => set({ fps: Math.round(fps) })} />
			<NumberField label="Duration" value={project.duration} step={0.5} min={0.1} max={600} suffix="s" onChange={(duration) => set({ duration })} />
			<ColorField label="Background" value={project.background} onChange={(background) => set({ background })} />
			<p className="text-muted-foreground text-[10px]">Background “none” is transparent.</p>
			<h3 className="text-muted-foreground mt-3 text-[10px] font-semibold uppercase">Colours in this animation</h3>
			<div className="flex flex-wrap gap-1.5" data-motion-theme-colors>
				{projectColors(project).map((c) => (
					<label key={c} className="relative size-7 cursor-pointer border" style={{ background: c }} title={`${c}: click to change it everywhere`}>
						<span className="sr-only">Change {c}</span>
						<input
							type="color"
							value={c.slice(0, 7)}
							className="absolute inset-0 opacity-0"
							onChange={(e) => commit((p) => replaceColor({ project: p, from: c, to: e.target.value.toUpperCase() }))}
						/>
					</label>
				))}
			</div>
			{projectFonts(project).length > 0 && (
				<>
					<h3 className="text-muted-foreground mt-3 text-[10px] font-semibold uppercase">Fonts</h3>
					{projectFonts(project).map((f) => (
						<label key={f} className="flex items-center gap-1 text-[11px]">
							<span className="text-muted-foreground w-14 shrink-0 truncate">{f}</span>
							<select
								value={f}
								onChange={(e) => commit((p) => replaceFont({ project: p, from: f, to: e.target.value }))}
								className="bg-muted/50 h-6 min-w-0 flex-1 border px-1"
								data-motion-theme-font
							>
								{[...new Set([f, "Inter", "Poppins", "Montserrat", "Roboto", "Noto Sans Sinhala", "Noto Sans Tamil", "Georgia", "Courier New"])].map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
							</select>
						</label>
					))}
				</>
			)}
		</div>
	);
}

/** Properties of the selected layer, or the canvas settings when nothing is selected. */
export function PropertiesPanel() {
	const project = useStudio((s) => s.project);
	const selection = useStudio((s) => s.selection);
	if (!project) return null;
	const layer = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : null;
	return (
		<div className="h-full overflow-y-auto p-3">
			{layer ? (
				<LayerProps layer={layer} />
			) : selection.length > 1 ? (
				<p className="text-muted-foreground text-xs">{selection.length} layers selected. Drag on the canvas to move them together.</p>
			) : (
				<ProjectProps project={project} />
			)}
		</div>
	);
}
