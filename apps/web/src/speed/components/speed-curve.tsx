"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Copy, ClipboardPaste, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { speedAt, type SpeedKeyframe } from "@/retime";
import { cn } from "@/utils/ui";
import { readCurve, setSpeedCurve } from "../apply-curve";
import {
	applyCurve,
	BUILT_IN_CURVES,
	type CurveClip,
	type SpeedCurvePreset,
	useCurveLibrary,
	withIds,
} from "../speed-curve-model";
import { SpeedCurveEditor } from "./speed-curve-editor";

function CurveIcon({ keyframes }: { keyframes: Omit<SpeedKeyframe, "id">[] }) {
	const w = 64;
	const h = 32;
	const max = 3;
	const keys = keyframes.map((k, i) => ({ ...k, id: String(i) }));
	const y = (v: number) =>
		h - 3 - ((Math.log(Math.min(max, Math.max(1 / max, v))) + Math.log(max)) / (Math.log(max) * 2)) * (h - 6);
	const path = Array.from({ length: 33 }, (_, i) => {
		const u = i / 32;
		return `${i === 0 ? "M" : "L"}${(u * w).toFixed(1)},${y(speedAt({ keyframes: keys, p: u })).toFixed(1)}`;
	}).join(" ");
	return (
		<svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-16" aria-hidden>
			<line x1={0} x2={w} y1={y(1)} y2={y(1)} className="stroke-muted-foreground/30" strokeDasharray="2 2" />
			<path d={path} fill="none" className="stroke-foreground" strokeWidth={1.75} />
		</svg>
	);
}

function PresetTile({
	label,
	active,
	onClick,
	children,
	onDelete,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
	onDelete?: () => void;
}) {
	return (
		<div className="group relative">
			<button type="button" onClick={onClick} data-curve={label} className="flex w-full flex-col items-center gap-1 text-[11px]">
				<span
					className={cn(
						"bg-muted/60 flex h-14 w-full items-center justify-center rounded-lg border-2",
						active ? "border-[#22D3EE]" : "border-transparent",
					)}
				>
					{children}
				</span>
				<span className="w-full truncate text-center">{label}</span>
			</button>
			{onDelete && (
				<button
					type="button"
					onClick={onDelete}
					aria-label={`Delete preset ${label}`}
					className="bg-background absolute top-0.5 right-0.5 hidden rounded p-0.5 group-hover:block"
				>
					<Trash2 className="size-3" />
				</button>
			)}
		</div>
	);
}

/**
 * Speed › Curve: presets and a full curve editor. The clip stays one clip;
 * the curve remaps its time (see retime/curve.ts).
 */
export function SpeedCurvePanel({ element, trackId }: { element: CurveClip; trackId: string }) {
	const editor = useEditor();
	const { saved, save, remove, copy, clipboard } = useCurveLibrary();
	const legacy = readCurve(element);
	const active = element.retime?.curve?.length ? (element.retime.curvePreset ?? "custom") : "none";
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(300);
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.max(160, Math.floor(entry.contentRect.width))));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const apply = (preset: SpeedCurvePreset | null) =>
		applyCurve({ editor, trackId, element, keyframes: preset ? withIds(preset.keyframes) : null, preset: preset?.id });

	if (legacy) {
		// Curves from earlier versions were applied by splitting the clip.
		return (
			<div className="flex flex-col gap-2 text-xs">
				<p className="text-muted-foreground m-0 leading-relaxed">
					This clip uses an older speed curve made of {legacy.points.length > 0 ? "many short pieces" : "pieces"}. Convert it
					to one clip with an editable curve.
				</p>
				<button
					type="button"
					className="bg-secondary rounded-md px-3 py-2"
					onClick={() => {
						const id = setSpeedCurve({ editor, trackId, element, preset: null, points: null });
						const merged = editor.timeline.getElementsWithTracks({ elements: id ? [{ trackId, elementId: id }] : [] })[0]?.element;
						if (merged && (merged.type === "video" || merged.type === "audio") && legacy.points.length) {
							applyCurve({
								editor,
								trackId,
								element: merged,
								keyframes: withIds(
									legacy.points.map((speed, i) => ({
										at: legacy.points.length === 1 ? 0 : i / (legacy.points.length - 1),
										speed: speed * legacy.base,
										interpolation: "smooth" as const,
									})),
								),
								preset: legacy.preset,
							});
						}
					}}
				>
					Convert to one clip
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3" data-speed-curve>
			<div className="grid grid-cols-4 gap-2">
				<PresetTile label="Normal" active={active === "none"} onClick={() => apply(null)}>
					<Ban className="text-muted-foreground size-5" />
				</PresetTile>
				{BUILT_IN_CURVES.map((preset) => (
					<PresetTile key={preset.id} label={preset.label} active={active === preset.id} onClick={() => apply(preset)}>
						<CurveIcon keyframes={preset.keyframes} />
					</PresetTile>
				))}
				{saved.map((preset) => (
					<PresetTile
						key={preset.id}
						label={preset.label}
						active={active === preset.id}
						onClick={() => apply(preset)}
						onDelete={() => remove(preset.id)}
					>
						<CurveIcon keyframes={preset.keyframes} />
					</PresetTile>
				))}
			</div>

			<div ref={box} className="flex flex-col gap-2">
				<div className="flex items-center justify-between text-xs">
					<span className="font-semibold">{active === "custom" ? "Custom curve" : "Curve"}</span>
					<div className="flex gap-1">
						<IconButton
							label="Save as preset"
							disabled={!element.retime?.curve?.length}
							onClick={() => {
								const name = window.prompt("Name this speed curve", "My curve");
								if (name?.trim() && element.retime?.curve) {
									save({ label: name.trim(), keyframes: element.retime.curve });
									toast.success("Speed curve saved");
								}
							}}
						>
							<Save className="size-3.5" />
						</IconButton>
						<IconButton
							label="Copy curve"
							disabled={!element.retime?.curve?.length}
							onClick={() => element.retime?.curve && copy(element.retime.curve)}
						>
							<Copy className="size-3.5" />
						</IconButton>
						<IconButton
							label="Paste curve"
							disabled={!clipboard}
							onClick={() => clipboard && applyCurve({ editor, trackId, element, keyframes: withIds(clipboard), preset: "custom" })}
						>
							<ClipboardPaste className="size-3.5" />
						</IconButton>
					</div>
				</div>
				<div className="bg-muted/30 overflow-hidden rounded-lg border">
					<SpeedCurveEditor element={element} trackId={trackId} width={width - 2} height={160} />
				</div>
				<p className="text-muted-foreground m-0 text-[11px] leading-relaxed">
					Drag points up to speed up, down to slow down, and sideways to change when. Double-click to add a point or edit one
					exactly; right-click for smooth, linear or hold. Shift-drag for fine control. The clip stays in one piece, and clips
					after it move along when ripple editing is on.
				</p>
			</div>
		</div>
	);
}

function IconButton({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="hover:bg-accent rounded p-1 disabled:opacity-40"
		>
			{children}
		</button>
	);
}
