"use client";

import { Pause, Play, SkipBack } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/utils/ui";
import { keyframeTimes } from "../model";
import { useStudio } from "../store";

function formatTime({ t, fps }: { t: number; fps: number }) {
	const frames = Math.round(t * fps);
	const s = Math.floor(frames / fps);
	return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(frames % fps).padStart(2, "0")}`;
}

/** Playback, a scrubbable time ruler and each layer's keyframes. */
export function MotionTimeline() {
	const project = useStudio((s) => s.project);
	const time = useStudio((s) => s.time);
	const playing = useStudio((s) => s.playing);
	const selection = useStudio((s) => s.selection);
	const trackRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!playing) return;
		let frame = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const s = useStudio.getState();
			const duration = s.project?.duration ?? 1;
			let t = s.time + (now - last) / 1000;
			last = now;
			if (t >= duration) t = 0;
			s.setTime(t);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing]);

	if (!project) return null;
	const { setTime, setPlaying, select } = useStudio.getState();
	const pct = (t: number) => `${(t / project.duration) * 100}%`;
	const scrub = (clientX: number) => {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect) return;
		const t = ((clientX - rect.left) / rect.width) * project.duration;
		setTime(Math.round(Math.max(0, t) * project.fps) / project.fps);
	};
	const seconds = Array.from({ length: Math.floor(project.duration) + 1 }, (_, i) => i);
	const rows = [...project.layers].reverse();

	return (
		<div className="flex h-full min-h-0 flex-col text-xs" data-motion-timeline>
			<div className="flex items-center gap-2 border-b px-2 py-1">
				<button type="button" aria-label="Go to start" onClick={() => setTime(0)} className="hover:text-foreground text-muted-foreground">
					<SkipBack className="size-3.5" />
				</button>
				<button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)} data-motion-play>
					{playing ? <Pause className="size-4" /> : <Play className="size-4" />}
				</button>
				<span className="tabular-nums" data-motion-time>
					{formatTime({ t: time, fps: project.fps })}
				</span>
				<span className="text-muted-foreground tabular-nums">/ {formatTime({ t: project.duration, fps: project.fps })}</span>
				<span className="text-muted-foreground ml-auto text-[11px]">◆ on a property in the right panel adds a keyframe at the playhead</span>
			</div>
			<div className="flex min-h-0 flex-1 overflow-y-auto">
				<div className="w-40 shrink-0 border-r">
					<div className="h-5 border-b" />
					{rows.map((l) => (
						<button
							key={l.id}
							type="button"
							onClick={() => select([l.id])}
							className={cn("block h-6 w-full truncate px-2 text-left", selection.includes(l.id) && "bg-primary/20")}
						>
							{l.name}
						</button>
					))}
				</div>
				<div className="relative min-w-0 flex-1 px-2">
					<div
						ref={trackRef}
						className="relative h-full"
						onPointerDown={(e) => {
							(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
							scrub(e.clientX);
						}}
						onPointerMove={(e) => e.buttons === 1 && scrub(e.clientX)}
						data-motion-track
					>
						<div className="relative h-5 border-b">
							{seconds.map((s) => (
								<span key={s} className="text-muted-foreground absolute top-0.5 -translate-x-1/2 text-[10px]" style={{ left: pct(s) }}>
									{s}s
								</span>
							))}
						</div>
						{rows.map((l) => (
							<div key={l.id} className="relative h-6 border-b border-white/5">
								{keyframeTimes(l).map((t) => (
									<button
										key={t}
										type="button"
										aria-label={`Keyframe at ${t.toFixed(2)}s`}
										className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#F59E0B]"
										style={{ left: pct(t) }}
										onPointerDown={(e) => {
											e.stopPropagation();
											select([l.id]);
											setTime(t);
										}}
										data-motion-keyframe
										data-keep-round
									/>
								))}
							</div>
						))}
						<div className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#22D3EE]" style={{ left: pct(time) }} />
					</div>
				</div>
			</div>
		</div>
	);
}
