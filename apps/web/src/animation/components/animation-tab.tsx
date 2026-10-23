"use client";

import { useEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import type { ParamValues } from "@/params";
import type { TimelineElement } from "@/timeline";
import { cn } from "@/utils/ui";
import {
	type AnimationPreset,
	CAPTION_ANIMATIONS,
	COMBO_ANIMATIONS,
	IN_ANIMATIONS,
	OUT_ANIMATIONS,
	animationState,
} from "../clip-animation";

type Mode = "in" | "out" | "combo" | "caption";

const MODES: { id: Mode; label: string; presets: AnimationPreset[] }[] = [
	{ id: "in", label: "In", presets: IN_ANIMATIONS },
	{ id: "out", label: "Out", presets: OUT_ANIMATIONS },
	{ id: "combo", label: "Combo", presets: COMBO_ANIMATIONS },
	{ id: "caption", label: "Caption", presets: CAPTION_ANIMATIONS },
];

const PARAM: Record<Mode, string> = {
	in: "animation.in",
	out: "animation.out",
	combo: "animation.combo",
	caption: "animation.caption",
};

/** One looping preview: the preset plays on a small card while hovered. */
function PresetTile({
	mode,
	preset,
	selected,
	isText,
	thumbnail,
	onPick,
}: {
	mode: Mode;
	preset: AnimationPreset;
	selected: boolean;
	isText: boolean;
	thumbnail: string | null;
	onPick: () => void;
}) {
	const [hover, setHover] = useState(false);
	const card = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = card.current;
		if (!el || preset.value === "none") return;
		// A 2 s loop: the edge animation over the first (In) or last (Out)
		// second; a still mid-way frame when not hovered.
		const loop = 2;
		const paramsFor: ParamValues =
			mode === "combo"
				? { "animation.combo": preset.value, "animation.comboSpeed": 1 }
				: mode === "caption"
					? { "animation.caption": preset.value }
					: {
						[PARAM[mode]]: preset.value,
						"animation.inDuration": 0.9,
						"animation.outDuration": 0.9,
					};
		const draw = (seconds: number) => {
			const s = animationState({
				params: paramsFor,
				localSeconds: seconds,
				durationSeconds: loop,
			});
			el.style.opacity = String(s.opacity);
			el.style.transform = `translate(${s.offsetX * 60}%, ${s.offsetY * 60}%) scale(${s.scale}) rotate(${s.rotate}deg)`;
			el.style.clipPath =
				s.reveal < 1 ? `inset(0 ${(1 - s.reveal) * 100}% 0 0)` : "";
		};
		if (!hover) {
			draw(mode === "in" ? 0.45 : mode === "out" ? loop - 0.45 : 0.6);
			return;
		}
		let frame = 0;
		const start = performance.now();
		const tick = (now: number) => {
			draw((((now - start) / 1000) % (loop + 0.4)) - 0.2);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [hover, mode, preset.value]);

	return (
		<button
			type="button"
			onClick={onPick}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			data-animation={`${mode}:${preset.value}`}
			aria-pressed={selected}
			className="group flex min-w-0 flex-col items-center gap-1.5"
		>
			<span
				className={cn(
					"relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[#0b0d12]",
					selected
						? "ring-2 ring-[#22D3EE] ring-offset-2 ring-offset-background"
						: "ring-1 ring-white/5 group-hover:ring-white/20",
				)}
			>
				{preset.value === "none" ? (
					<Ban className="text-muted-foreground size-7" strokeWidth={1.5} />
				) : (
					<div ref={card} className="size-full will-change-transform">
						{thumbnail ? (
							// eslint-disable-next-line @next/next/no-img-element -- local blob/data URL
							<img src={thumbnail} alt="" className="size-full object-cover" />
						) : (
							<div className="flex size-full items-center justify-center bg-linear-to-br from-[#f7b267] via-[#f4845f] to-[#7b2cbf]">
								<span className="text-lg font-bold text-white drop-shadow">
									{isText ? "Aa" : ""}
								</span>
							</div>
						)}
					</div>
				)}
			</span>
			<span className="text-muted-foreground group-aria-pressed:text-foreground w-full truncate text-center text-[11px]">
				{preset.label}
			</span>
		</button>
	);
}

/** The Animation panel: In / Out / Combo presets for the selected clip. */
export function AnimationTab({
	element,
	trackId,
	thumbnail = null,
}: {
	element: TimelineElement;
	trackId: string;
	thumbnail?: string | null;
}) {
	const editor = useEditor();
	const [mode, setMode] = useState<Mode>("in");
	const [dragValue, setDragValue] = useState<number | null>(null);
	const params: ParamValues = element.params;
	const isText = element.type === "text";
	const current = MODES.find((m) => m.id === mode) ?? MODES[0];
	const selected =
		typeof params[PARAM[mode]] === "string" ? params[PARAM[mode]] : "none";

	const write = (patch: ParamValues) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: { params: { ...element.params, ...patch } },
				},
			],
		});
	};

	const durationKey =
		mode === "in"
			? "animation.inDuration"
			: mode === "out"
				? "animation.outDuration"
				: "animation.comboSpeed";
	const durationValue =
		typeof params[durationKey] === "number"
			? Number(params[durationKey])
			: mode === "in"
				? 0.6
				: mode === "out"
					? 0.4
					: 1;

	return (
		<div className="flex flex-col gap-4 p-4" data-animation-tab>
			<span className="text-sm font-semibold">Animation</span>
			<div
				className={cn(
					"bg-accent/60 grid gap-1 rounded-xl p-1",
					isText ? "grid-cols-4" : "grid-cols-3",
				)}
			>
				{MODES.filter((m) => isText || m.id !== "caption").map((m) => (
					<button
						key={m.id}
						type="button"
						onClick={() => setMode(m.id)}
						className={cn(
							"rounded-lg py-1.5 text-sm transition-colors",
							mode === m.id
								? "bg-background text-foreground font-semibold shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{isText && m.id === "combo" ? "Loop" : m.label}
					</button>
				))}
			</div>
			<div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
				{current.presets
					.filter((preset) => isText || !preset.textOnly)
					.map((preset) => (
						<PresetTile
							key={preset.value}
							mode={mode}
							preset={preset}
							selected={selected === preset.value}
							isText={isText}
							thumbnail={thumbnail}
							onPick={() => write({ [PARAM[mode]]: preset.value })}
						/>
					))}
			</div>
			{mode === "caption" && selected === "highlight" && (
				<div className="flex items-center gap-2 border-t pt-3 text-xs">
					<label htmlFor="highlight-color" className="text-muted-foreground">
						Highlight colour
					</label>
					<input
						id="highlight-color"
						type="color"
						className="h-6 w-10 cursor-pointer rounded border bg-transparent"
						value={
							typeof params["animation.highlightColor"] === "string"
								? String(params["animation.highlightColor"])
								: "#ffd400"
						}
						onChange={(e) => write({ "animation.highlightColor": e.target.value })}
					/>
					<span className="text-muted-foreground">
						{element.type === "text" && element.words?.length
							? "Follows each word as it's spoken."
							: "This caption has no word timings yet."}
					</span>
				</div>
			)}
			{selected !== "none" && mode !== "caption" && (
				<div className="flex flex-col gap-2 border-t pt-3">
					<div className="flex justify-between text-xs">
						<span className="text-muted-foreground">
							{mode === "combo" ? "Speed" : "Duration"}
						</span>
						<span className="tabular-nums">
							{mode === "combo"
								? `${(dragValue ?? durationValue).toFixed(2)}×`
								: `${(dragValue ?? durationValue).toFixed(1)} s`}
						</span>
					</div>
					<Slider
						value={[dragValue ?? durationValue]}
						min={mode === "combo" ? 0.25 : 0.1}
						max={mode === "combo" ? 4 : 5}
						step={mode === "combo" ? 0.05 : 0.1}
						onValueChange={([value]) => setDragValue(value)}
						onValueCommit={([value]) => {
							setDragValue(null);
							write({ [durationKey]: value });
						}}
					/>
				</div>
			)}
		</div>
	);
}
