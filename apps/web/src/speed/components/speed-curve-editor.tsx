"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import {
	clipFractionOfKeyframe,
	MAX_CURVE_SPEED,
	MIN_CURVE_SPEED,
	normalizeCurve,
	sourceFractionAtClipFraction,
	speedAt,
	speedAtClipFraction,
	type SpeedInterpolation,
	type SpeedKeyframe,
} from "@/retime";
import { generateUUID } from "@/utils/id";
import { cn } from "@/utils/ui";
import { applyCurve, type CurveClip, FLAT_CURVE, previewCurve, useCurveLibrary, withIds } from "../speed-curve-model";

const LOG_MIN = Math.log(MIN_CURVE_SPEED);
const LOG_MAX = Math.log(MAX_CURVE_SPEED);
/** Speeds this close to 1× (in log units) snap to it while dragging. */
const SNAP_TO_ONE = 0.06;
/** Pixels within which a keyframe snaps to the playhead. */
const SNAP_PX = 6;

const speedToY = ({ speed, height, pad }: { speed: number; height: number; pad: number }) =>
	pad + (1 - (Math.log(speed) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (height - pad * 2);
const yToSpeed = ({ y, height, pad }: { y: number; height: number; pad: number }) => {
	const t = 1 - (y - pad) / (height - pad * 2);
	return Math.exp(LOG_MIN + Math.min(1, Math.max(0, t)) * (LOG_MAX - LOG_MIN));
};
const formatSpeed = (speed: number) => `${speed < 1 ? speed.toFixed(2) : speed.toFixed(speed < 10 ? 1 : 0)}×`;

interface Drag {
	ids: string[];
	startX: number;
	startY: number;
	/** Curve when the drag began; positions are measured against it so the drag doesn't feed back. */
	origin: SpeedKeyframe[];
	moved: boolean;
}

/**
 * Interactive speed curve for one clip: horizontal line at 1×, drag points up
 * (faster) or down (slower) and sideways (when). Shared by the timeline lane
 * and Speed › Curve. Changes preview live and commit as one undo step.
 */
export function SpeedCurveEditor({
	element,
	trackId,
	width,
	height,
	compact = false,
	clipStartTime,
	pixelsPerTick,
}: {
	element: CurveClip;
	trackId: string;
	width: number;
	height: number;
	/** Timeline lane: thinner, no grid labels. */
	compact?: boolean;
	/** With these, keyframes snap to the playhead. */
	clipStartTime?: number;
	pixelsPerTick?: number;
}) {
	const editor = useEditor();
	const committed = useMemo(
		() => element.retime?.curve ?? withIds(FLAT_CURVE),
		[element.retime?.curve],
	);
	const [draft, setDraft] = useState<SpeedKeyframe[] | null>(null);
	const keys = draft ?? committed;
	const [selected, setSelected] = useState<string[]>([]);
	const [hover, setHover] = useState<{ x: number; y: number; speed: number } | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; id: string | null } | null>(null);
	const [details, setDetails] = useState<string | null>(null);
	const drag = useRef<Drag | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const pad = compact ? 4 : 10;
	const copy = useCurveLibrary((s) => s.copy);
	const clipboard = useCurveLibrary((s) => s.clipboard);

	const xOf = (k: SpeedKeyframe) => clipFractionOfKeyframe({ keyframes: keys, at: k.at }) * width;
	const commit = (next: SpeedKeyframe[] | null) => {
		setDraft(null);
		applyCurve({ editor, trackId, element, keyframes: next, preset: next ? "custom" : undefined });
	};
	const preview = (next: SpeedKeyframe[]) => {
		setDraft(next);
		previewCurve({ editor, trackId, element, keyframes: next });
	};

	const path = useMemo(() => {
		const steps = Math.max(24, Math.round(width / 3));
		let d = "";
		for (let i = 0; i <= steps; i++) {
			const u = i / steps;
			const y = speedToY({ speed: speedAtClipFraction({ keyframes: keys, u }), height, pad });
			d += `${i === 0 ? "M" : "L"}${(u * width).toFixed(1)},${y.toFixed(1)}`;
		}
		return d;
	}, [keys, width, height, pad]);

	const local = (e: { clientX: number; clientY: number }) => {
		const rect = svgRef.current?.getBoundingClientRect();
		return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
	};

	const addAt = ({ x, y }: { x: number; y?: number }) => {
		const u = Math.min(1, Math.max(0, x / width));
		const at = sourceFractionAtClipFraction({ keyframes: keys, u });
		const speed = y === undefined ? speedAt({ keyframes: keys, p: at }) : yToSpeed({ y, height, pad });
		const key: SpeedKeyframe = { id: generateUUID(), at, speed, interpolation: "smooth" };
		const next = normalizeCurve([...keys, key]);
		commit(next);
		setSelected([key.id]);
	};

	const removeIds = (ids: string[]) => {
		const next = keys.filter((k) => !ids.includes(k.id));
		commit(next.length ? next : null);
		setSelected([]);
	};

	const setInterpolation = ({ ids, interpolation }: { ids: string[]; interpolation: SpeedInterpolation }) =>
		commit(keys.map((k) => (ids.includes(k.id) ? { ...k, interpolation } : k)));

	// Delete / Backspace remove selected points; K adds one at the playhead.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target;
			if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
				e.preventDefault();
				e.stopPropagation();
				removeIds(selected);
			} else if ((e.key === "k" || e.key === "K") && !e.metaKey && !e.ctrlKey && clipStartTime !== undefined && pixelsPerTick) {
				const x = (editor.playback.getCurrentTime() - clipStartTime) * pixelsPerTick;
				if (x >= 0 && x <= width) {
					e.preventDefault();
					addAt({ x });
				}
			}
		};
		if (!selected.length && clipStartTime === undefined) return;
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});

	const onPointDown = ({ e, id }: { e: React.PointerEvent; id: string }) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		const ids = e.shiftKey ? [...new Set([...selected, id])] : selected.includes(id) ? selected : [id];
		setSelected(ids);
		const p = local(e);
		drag.current = { ids, startX: p.x, startY: p.y, origin: keys, moved: false };
	};

	const onMove = (e: React.PointerEvent) => {
		const p = local(e);
		const d = drag.current;
		if (!d) {
			const u = Math.min(1, Math.max(0, p.x / width));
			setHover({ x: p.x, y: p.y, speed: speedAtClipFraction({ keyframes: keys, u }) });
			return;
		}
		const dx = p.x - d.startX;
		const dy = p.y - d.startY;
		if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
		d.moved = true;
		const fine = e.shiftKey ? 0.2 : 1;
		const dLog = (-dy * fine * (LOG_MAX - LOG_MIN)) / (height - pad * 2);
		const playheadX =
			clipStartTime !== undefined && pixelsPerTick ? (editor.playback.getCurrentTime() - clipStartTime) * pixelsPerTick : null;
		const next = d.origin.map((k, index) => {
			if (!d.ids.includes(k.id)) return k;
			let logSpeed = Math.log(k.speed) + dLog;
			if (Math.abs(logSpeed) < SNAP_TO_ONE && d.ids.length === 1) logSpeed = 0;
			let at = k.at;
			// Only a single point moves sideways; ends stay at the clip edges.
			if (d.ids.length === 1 && index > 0 && index < d.origin.length - 1) {
				let x = clipFractionOfKeyframe({ keyframes: d.origin, at: k.at }) * width + dx * fine;
				if (playheadX !== null && Math.abs(x - playheadX) < SNAP_PX) x = playheadX;
				const prev = d.origin[index - 1].at + 0.005;
				const nextAt = d.origin[index + 1].at - 0.005;
				at = Math.min(nextAt, Math.max(prev, sourceFractionAtClipFraction({ keyframes: d.origin, u: x / width })));
			}
			return { ...k, at, speed: Math.exp(Math.min(LOG_MAX, Math.max(LOG_MIN, logSpeed))) };
		});
		preview(normalizeCurve(next));
		setHover({ x: p.x, y: p.y, speed: next.find((k) => k.id === d.ids[0])?.speed ?? 1 });
	};

	const onUp = () => {
		const d = drag.current;
		drag.current = null;
		if (d?.moved && draft) commit(draft);
	};

	const preset = element.retime?.curvePreset;

	return (
		<div className="relative select-none" style={{ width, height }} data-speed-curve-editor>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				className="block overflow-visible"
				onPointerMove={onMove}
				onPointerUp={onUp}
				onPointerLeave={() => !drag.current && setHover(null)}
				onPointerDown={(e) => {
					if (e.button === 0 && !e.shiftKey) setSelected([]);
					setMenu(null);
				}}
				onDoubleClick={(e) => {
					const p = local(e);
					addAt({ x: p.x, y: p.y });
				}}
				onContextMenu={(e) => {
					e.preventDefault();
					e.stopPropagation();
					const p = local(e);
					setMenu({ x: p.x, y: p.y, id: null });
				}}
				role="img"
				aria-label={`Speed curve${preset ? ` (${preset})` : ""}. Double-click to add a point.`}
			>
				<rect width={width} height={height} className="fill-amber-500/10" />
				{(compact ? [1] : [0.25, 0.5, 1, 2, 4]).map((v) => (
					<g key={v}>
						<line
							x1={0}
							x2={width}
							y1={speedToY({ speed: v, height, pad })}
							y2={speedToY({ speed: v, height, pad })}
							className={v === 1 ? "stroke-amber-400/60" : "stroke-foreground/10"}
							strokeDasharray={v === 1 ? undefined : "3 4"}
						/>
						{!compact && (
							<text x={4} y={speedToY({ speed: v, height, pad }) - 2} className="fill-muted-foreground text-[9px]">
								{v}×
							</text>
						)}
					</g>
				))}
				{/* Amber, so it never reads as the white volume line. */}
				<path d={path} fill="none" className="stroke-amber-400" strokeWidth={compact ? 1.75 : 2.5} strokeLinejoin="round" />
				{keys.map((k) => {
					const x = xOf(k);
					const y = speedToY({ speed: k.speed, height, pad });
					const isSelected = selected.includes(k.id);
					return (
						<g key={k.id}>
							{/* Larger invisible target so small points are easy to grab. */}
							<circle
								cx={x}
								cy={y}
								r={9}
								className="cursor-grab fill-transparent active:cursor-grabbing"
								onPointerDown={(e) => onPointDown({ e, id: k.id })}
								onDoubleClick={(e) => {
									e.stopPropagation();
									setDetails(k.id);
								}}
								onContextMenu={(e) => {
									e.preventDefault();
									e.stopPropagation();
									if (!selected.includes(k.id)) setSelected([k.id]);
									const p = local(e);
									setMenu({ x: p.x, y: p.y, id: k.id });
								}}
							/>
							<rect
								x={x - (compact ? 3.5 : 5)}
								y={y - (compact ? 3.5 : 5)}
								width={compact ? 7 : 10}
								height={compact ? 7 : 10}
								transform={`rotate(45 ${x} ${y})`}
								className={cn(
									"pointer-events-none stroke-white",
									isSelected ? "fill-white stroke-amber-500" : "fill-amber-400",
								)}
								strokeWidth={1.5}
							/>
						</g>
					);
				})}
			</svg>
			{hover && (
				<div
					className="bg-popover pointer-events-none absolute z-20 rounded px-1.5 py-0.5 text-[10px] tabular-nums shadow"
					style={{ left: Math.min(width - 36, Math.max(0, hover.x + 8)), top: Math.max(0, hover.y - 20) }}
				>
					{formatSpeed(hover.speed)}
				</div>
			)}
			{menu && (
				<div
					className="bg-popover absolute z-30 flex min-w-40 flex-col rounded-md border p-1 text-xs shadow-lg"
					style={{ left: Math.min(menu.x, Math.max(0, width - 160)), top: menu.y }}
					onPointerDown={(e) => e.stopPropagation()}
					role="menu"
				>
					{menu.id ? (
						<>
							{(["smooth", "linear", "hold"] as const).map((mode) => (
								<MenuItem key={mode} onClick={() => { setInterpolation({ ids: selected, interpolation: mode }); setMenu(null); }}>
									{mode === "smooth" ? "Smooth" : mode === "linear" ? "Linear" : "Hold (jump)"}
									{keys.find((k) => k.id === menu.id)?.interpolation === mode ? " ✓" : ""}
								</MenuItem>
							))}
							<MenuItem onClick={() => { setDetails(menu.id); setMenu(null); }}>Exact speed and time…</MenuItem>
							<MenuItem onClick={() => { removeIds(selected); setMenu(null); }} danger>
								Delete point{selected.length > 1 ? "s" : ""}
							</MenuItem>
						</>
					) : (
						<MenuItem onClick={() => { addAt({ x: menu.x, y: menu.y }); setMenu(null); }}>Add point here</MenuItem>
					)}
					<MenuItem onClick={() => { copy(keys); setMenu(null); }}>Copy curve</MenuItem>
					<MenuItem disabled={!clipboard} onClick={() => { if (clipboard) commit(withIds(clipboard)); setMenu(null); }}>
						Paste curve
					</MenuItem>
					<MenuItem onClick={() => { commit(null); setMenu(null); }}>Reset to normal speed</MenuItem>
				</div>
			)}
			{details && (
				<KeyframeDetails
					keyframe={keys.find((k) => k.id === details) ?? null}
					onClose={() => setDetails(null)}
					onChange={(patch) => commit(normalizeCurve(keys.map((k) => (k.id === details ? { ...k, ...patch } : k))))}
				/>
			)}
		</div>
	);
}

function MenuItem({ children, onClick, danger, disabled }: { children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
	return (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			onClick={onClick}
			className={cn("hover:bg-accent rounded px-2 py-1.5 text-left disabled:opacity-40", danger && "text-destructive")}
		>
			{children}
		</button>
	);
}

/** Double-click a point: type its speed, position and ease exactly. */
function KeyframeDetails({
	keyframe,
	onChange,
	onClose,
}: {
	keyframe: SpeedKeyframe | null;
	onChange: (patch: Partial<SpeedKeyframe>) => void;
	onClose: () => void;
}) {
	if (!keyframe) return null;
	return (
		<div
			className="bg-popover absolute top-1 left-1/2 z-30 flex w-56 -translate-x-1/2 flex-col gap-2 rounded-md border p-3 text-xs shadow-lg"
			onPointerDown={(e) => e.stopPropagation()}
			role="dialog"
			aria-label="Speed point"
		>
			<label className="flex items-center justify-between gap-2">
				Speed
				<input
					type="number"
					min={MIN_CURVE_SPEED}
					max={MAX_CURVE_SPEED}
					step={0.05}
					defaultValue={Number(keyframe.speed.toFixed(2))}
					onBlur={(e) => onChange({ speed: Number(e.target.value) || 1 })}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					className="bg-input w-20 rounded border px-1.5 py-0.5"
				/>
			</label>
			<label className="flex items-center justify-between gap-2">
				Position in clip (%)
				<input
					type="number"
					min={0}
					max={100}
					step={1}
					defaultValue={Math.round(keyframe.at * 100)}
					onBlur={(e) => onChange({ at: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
					onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					className="bg-input w-20 rounded border px-1.5 py-0.5"
				/>
			</label>
			{keyframe.interpolation === "smooth" && (
				<label className="flex items-center justify-between gap-2">
					Ease to next point
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						defaultValue={keyframe.ease ?? 1}
						onPointerUp={(e) => onChange({ ease: Number(e.currentTarget.value) })}
						onKeyUp={(e) => onChange({ ease: Number(e.currentTarget.value) })}
						className="w-24"
					/>
				</label>
			)}
			<button type="button" onClick={onClose} className="bg-secondary self-end rounded px-2 py-1">
				Done
			</button>
		</div>
	);
}
