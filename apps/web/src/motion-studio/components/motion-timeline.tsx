"use client";

import { ChevronDown, ChevronRight, Pause, Play, SkipBack, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/ui";
import {
	ANIMATABLE,
	DEFAULT_PLAYBACK,
	keyframeTimes,
	moveKeyframes,
	playbackTime,
	removeKeyframe,
	sameKey,
	setKeyEase,
	type AnimProp,
	type Ease,
	type KeyRef,
	type Layer,
	type PlaybackSettings,
} from "../model";
import { useStudio } from "../store";
import { CurveEditor } from "./curve-editor";

const PROP_LABEL: Record<AnimProp, string> = { x: "Position X", y: "Position Y", scale: "Scale", rotation: "Rotation", opacity: "Opacity" };
const NAME_W = 176;

function formatTime({ t, fps }: { t: number; fps: number }) {
	const frames = Math.round(t * fps);
	const s = Math.floor(frames / fps);
	return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(frames % fps).padStart(2, "0")}`;
}

/** All keyframes of a layer at time `t` (the layer row's summary diamond). */
const keysAt = ({ layer, t }: { layer: Layer; t: number }): KeyRef[] =>
	ANIMATABLE.filter((prop) => layer.keyframes[prop]?.some((k) => Math.abs(k.t - t) < 1e-6)).map((prop) => ({ layerId: layer.id, prop, t }));

function Diamond({
	refs,
	left,
	big,
	onDown,
}: {
	refs: KeyRef[];
	left: number;
	big?: boolean;
	onDown: (args: { e: React.PointerEvent; refs: KeyRef[] }) => void;
}) {
	const selected = useStudio((s) => refs.length > 0 && refs.every((r) => s.keySelection.some((k) => sameKey({ a: k, b: r }))));
	return (
		<button
			type="button"
			aria-label={`Keyframe at ${refs[0]?.t.toFixed(2)}s`}
			data-motion-keyframe
			data-keep-round
			className={cn(
				"absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border",
				big ? "size-2.5" : "size-2",
				selected ? "border-white bg-[#22D3EE]" : "border-black/40 bg-[#F59E0B]",
			)}
			style={{ left, borderRadius: 1 }}
			onPointerDown={(e) => onDown({ e, refs })}
		/>
	);
}

/** Playback, a zoomable time ruler, layer and property rows with draggable keyframes, and the easing editor. */
export function MotionTimeline() {
	const project = useStudio((s) => s.project);
	const time = useStudio((s) => s.time);
	const playing = useStudio((s) => s.playing);
	const selection = useStudio((s) => s.selection);
	const keySelection = useStudio((s) => s.keySelection);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [pps, setPps] = useState(120);
	const scrollRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{ startX: number; layers: Layer[]; keys: KeyRef[]; moved: boolean } | null>(null);
	const easeDirty = useRef(false);

	const settings: PlaybackSettings = project?.playback ?? DEFAULT_PLAYBACK;

	useEffect(() => {
		if (!playing) return;
		const s0 = useStudio.getState();
		const p = s0.project;
		if (!p) return;
		const st = p.playback ?? DEFAULT_PLAYBACK;
		const d = p.duration;
		// Start from the playhead.
		let offset = (st.reverse ? d - s0.time : s0.time) / st.speed;
		if (st.mode === "once" && s0.time >= d - 1e-3 && !st.reverse) offset = 0;
		if (st.mode === "once" && st.reverse && s0.time <= 1e-3) offset = 0;
		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const { t, done } = playbackTime({ elapsed: offset + (now - start) / 1000, duration: d, settings: st });
			useStudio.getState().setTime(t);
			if (done) {
				useStudio.getState().setPlaying(false);
				return;
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const wheel = (e: WheelEvent) => {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			setPps((v) => Math.min(2000, Math.max(20, v * Math.exp(-e.deltaY * 0.002))));
		};
		el.addEventListener("wheel", wheel, { passive: false });
		return () => el.removeEventListener("wheel", wheel);
	}, []);

	if (!project) return null;
	const studio = useStudio.getState;
	const width = Math.max(1, project.duration * pps);
	const snap = (t: number) => Math.round(t * project.fps) / project.fps;
	const rows = [...project.layers].reverse();

	const scrubAt = (clientX: number) => {
		const rect = scrollRef.current?.getBoundingClientRect();
		const el = scrollRef.current;
		if (!rect || !el) return;
		studio().setTime(snap((clientX - rect.left + el.scrollLeft - 8) / pps));
	};

	const onKeyDown = ({ e, refs }: { e: React.PointerEvent; refs: KeyRef[] }) => {
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		const s = studio();
		let sel = s.keySelection;
		const isSelected = refs.every((r) => sel.some((k) => sameKey({ a: k, b: r })));
		if (e.shiftKey) sel = isSelected ? sel.filter((k) => !refs.some((r) => sameKey({ a: k, b: r }))) : [...sel, ...refs];
		else if (!isSelected) sel = refs;
		s.setKeySelection(sel);
		if (refs[0]) s.select([refs[0].layerId]);
		if (!s.project) return;
		drag.current = { startX: e.clientX, layers: s.project.layers, keys: sel, moved: false };
	};
	const onKeyMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dt = snap((e.clientX - d.startX) / pps);
		if (!d.moved && dt === 0) return;
		const s = studio();
		if (!d.moved) s.checkpoint();
		d.moved = true;
		const result = moveKeyframes({ layers: d.layers, keys: d.keys, dt, duration: project.duration });
		s.preview((p) => ({ ...p, layers: result.layers }));
		s.setKeySelection(result.keys);
	};
	const onKeyUp = (e: React.PointerEvent) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved && !e.shiftKey && d.keys[0]) studio().setTime(d.keys[0].t);
	};

	const firstKey = keySelection[0];
	const firstLayer = firstKey ? project.layers.find((l) => l.id === firstKey.layerId) : null;
	const ease: Ease | null = firstKey ? (firstLayer?.keyframes[firstKey.prop]?.find((k) => Math.abs(k.t - firstKey.t) < 1e-6)?.ease ?? null) : null;
	const setPlayback = (patch: Partial<PlaybackSettings>) => studio().commit((p) => ({ ...p, playback: { ...(p.playback ?? DEFAULT_PLAYBACK), ...patch } }));
	const deleteKeys = () => {
		const keys = studio().keySelection;
		studio().commit((p) => ({
			...p,
			layers: p.layers.map((l) => keys.filter((k) => k.layerId === l.id).reduce((acc, k) => removeKeyframe({ layer: acc, prop: k.prop, t: k.t }), l)),
		}));
		studio().setKeySelection([]);
	};
	const step = [0.1, 0.25, 0.5, 1, 2, 5, 10].find((s) => s * pps >= 70) ?? 30;
	const ticks = Array.from({ length: Math.floor(project.duration / step) + 1 }, (_, i) => Math.round(i * step * 1000) / 1000);

	return (
		<div className="flex h-full min-h-0 text-xs" data-motion-timeline>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-2 border-b px-2 py-1">
					<button type="button" aria-label="Go to start" onClick={() => studio().setTime(0)} className="text-muted-foreground hover:text-foreground">
						<SkipBack className="size-3.5" />
					</button>
					<button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => studio().setPlaying(!playing)} data-motion-play>
						{playing ? <Pause className="size-4" /> : <Play className="size-4" />}
					</button>
					<span className="tabular-nums" data-motion-time>
						{formatTime({ t: time, fps: project.fps })}
					</span>
					<span className="text-muted-foreground tabular-nums">/ {formatTime({ t: project.duration, fps: project.fps })}</span>
					<span className="bg-border mx-1 h-4 w-px" />
					<select
						value={settings.mode}
						onChange={(e) => setPlayback({ mode: e.target.value === "once" ? "once" : e.target.value === "bounce" ? "bounce" : "loop" })}
						className="bg-muted/50 h-6 border px-1"
						aria-label="Playback"
						data-motion-playback
					>
						<option value="loop">Loop</option>
						<option value="once">Play once</option>
						<option value="bounce">Bounce</option>
					</select>
					<label className="flex items-center gap-1">
						<input type="checkbox" checked={settings.reverse} onChange={(e) => setPlayback({ reverse: e.target.checked })} data-motion-reverse />
						Reverse
					</label>
					<select
						value={settings.speed}
						onChange={(e) => setPlayback({ speed: Number(e.target.value) })}
						className="bg-muted/50 h-6 border px-1"
						aria-label="Speed"
						data-motion-speed
					>
						{[0.25, 0.5, 1, 1.5, 2, 4].map((v) => (
							<option key={v} value={v}>
								{v}×
							</option>
						))}
					</select>
					<span className="ml-auto flex items-center gap-1">
						<button type="button" aria-label="Zoom timeline out" onClick={() => setPps((v) => Math.max(20, v / 1.5))} className="text-muted-foreground hover:text-foreground p-0.5">
							<ZoomOut className="size-3.5" />
						</button>
						<button type="button" aria-label="Zoom timeline in" onClick={() => setPps((v) => Math.min(2000, v * 1.5))} className="text-muted-foreground hover:text-foreground p-0.5" data-motion-tl-zoom-in>
							<ZoomIn className="size-3.5" />
						</button>
					</span>
				</div>
				<div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" data-motion-track>
					<div className="relative" style={{ width: NAME_W + width + 24 }}>
						<div className="bg-background sticky top-0 z-10 flex h-5 border-b">
							<div className="bg-background sticky left-0 z-10 shrink-0 border-r" style={{ width: NAME_W }} />
							<div
								className="relative cursor-pointer"
								style={{ width: width + 16, marginLeft: 0 }}
								onPointerDown={(e) => {
									e.currentTarget.setPointerCapture(e.pointerId);
									scrubAt(e.clientX - NAME_W);
									studio().setKeySelection([]);
								}}
								onPointerMove={(e) => e.buttons === 1 && scrubAt(e.clientX - NAME_W)}
								data-motion-ruler
							>
								{ticks.map((t) => (
									<span key={t} className="text-muted-foreground absolute top-0.5 -translate-x-1/2 text-[10px]" style={{ left: 8 + t * pps }}>
										{t}s
									</span>
								))}
							</div>
						</div>
						{rows.map((layer) => {
							const open = expanded[layer.id];
							const props = ANIMATABLE.filter((p) => layer.keyframes[p]?.length);
							return (
								<div key={layer.id}>
									<div className={cn("flex h-6 border-b border-white/5", selection.includes(layer.id) && "bg-primary/10")}>
										<div className="bg-background sticky left-0 z-[5] flex shrink-0 items-center gap-1 border-r px-1" style={{ width: NAME_W }}>
											<button
												type="button"
												aria-label={open ? "Collapse properties" : "Show properties"}
												className="text-muted-foreground"
												onClick={() => setExpanded((x) => ({ ...x, [layer.id]: !open }))}
												data-motion-expand={layer.id}
											>
												{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
											</button>
											<button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => studio().select([layer.id])}>
												{layer.name}
											</button>
										</div>
										<div className="relative" style={{ width: width + 16 }} onPointerMove={onKeyMove} onPointerUp={onKeyUp}>
											{keyframeTimes(layer).map((t) => (
												<Diamond key={t} refs={keysAt({ layer, t })} left={8 + t * pps} big onDown={onKeyDown} />
											))}
										</div>
									</div>
									{open &&
										(props.length ? props : (["x", "y", "scale", "rotation", "opacity"] as const)).map((prop) => (
											<div key={prop} className="flex h-5 border-b border-white/5" data-motion-prop-row={prop}>
												<div className="bg-background text-muted-foreground sticky left-0 z-[5] shrink-0 truncate border-r pr-1 pl-7 leading-5" style={{ width: NAME_W }}>
													{PROP_LABEL[prop]}
												</div>
												<div className="relative" style={{ width: width + 16 }} onPointerMove={onKeyMove} onPointerUp={onKeyUp}>
													{(layer.keyframes[prop] ?? []).map((k) => (
														<Diamond key={k.t} refs={[{ layerId: layer.id, prop, t: k.t }]} left={8 + k.t * pps} onDown={onKeyDown} />
													))}
												</div>
											</div>
										))}
								</div>
							);
						})}
						<div className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#22D3EE]" style={{ left: NAME_W + 8 + time * pps }} data-motion-playhead />
					</div>
				</div>
			</div>
			<aside className="w-60 shrink-0 overflow-y-auto border-l p-2" data-motion-key-panel>
				{keySelection.length && ease ? (
					<div className="flex flex-col gap-2">
						<div className="flex items-center">
							<span className="flex-1 font-medium">
								{keySelection.length} keyframe{keySelection.length === 1 ? "" : "s"} · easing
							</span>
							<button type="button" aria-label="Delete keyframes" onClick={deleteKeys} className="text-muted-foreground hover:text-foreground">
								<Trash2 className="size-3.5" />
							</button>
						</div>
						<CurveEditor
							ease={ease}
							onChange={(next) => {
								const s = studio();
								if (!easeDirty.current) s.checkpoint();
								easeDirty.current = true;
								s.preview((p) => ({ ...p, layers: setKeyEase({ layers: p.layers, keys: s.keySelection, ease: next }) }));
							}}
							onCommit={() => {
								easeDirty.current = false;
							}}
						/>
						<p className="text-muted-foreground text-[10px]">
							The curve runs from each selected keyframe to the next one. Drag keyframes to retime; Shift-click to select more; Ctrl+C / Ctrl+V copies them to the playhead.
						</p>
					</div>
				) : (
					<p className="text-muted-foreground text-[11px]">
						Click a keyframe ◆ to edit its easing. Drag to move it, Shift-click to select several, Delete removes them, and Ctrl+C / Ctrl+V pastes them at the playhead. Ctrl+scroll zooms the timeline.
					</p>
				)}
			</aside>
		</div>
	);
}
