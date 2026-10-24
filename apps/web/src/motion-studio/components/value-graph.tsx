"use client";

import { useState } from "react";
import { cn } from "@/utils/ui";
import { valueAt, type AnimProp, type Layer } from "../model";

const W = 220;
const H = 110;
const PAD = 8;

/**
 * A property's value over the whole animation, or its speed (how fast the
 * value changes), with the keyframes and the playhead marked.
 */
export function ValueGraph({ layer, prop, duration, time, onSeek }: { layer: Layer; prop: AnimProp; duration: number; time: number; onSeek: (t: number) => void }) {
	const [mode, setMode] = useState<"value" | "speed">("value");
	const steps = 160;
	const ts = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * duration);
	const values = ts.map((t) => valueAt({ layer, prop, t }));
	const series = mode === "value" ? values : values.map((v, i) => (i === 0 ? 0 : Math.abs(v - values[i - 1]) / (duration / steps)));
	if (mode === "speed") series[0] = series[1] ?? 0;
	let lo = Math.min(...series);
	let hi = Math.max(...series);
	if (hi - lo < 1e-9) {
		hi += 1;
		lo -= mode === "speed" ? 0 : 1;
	}
	const x = (t: number) => PAD + (t / duration) * (W - PAD * 2);
	const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2);
	const d = series.map((v, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
	const keys = layer.keyframes[prop] ?? [];
	const unit = prop === "rotation" ? "°" : prop === "scale" || prop === "opacity" ? "" : "px";
	return (
		<div className="flex flex-col gap-1" data-value-graph={mode}>
			<div className="flex gap-1 text-[10px]">
				{(["value", "speed"] as const).map((m) => (
					<button
						key={m}
						type="button"
						onClick={() => setMode(m)}
						className={cn("border px-1.5 py-0.5", mode === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
						data-value-graph-mode={m}
					>
						{m === "value" ? "Value" : "Speed"}
					</button>
				))}
				<span className="text-muted-foreground ml-auto self-center tabular-nums">
					{mode === "value" ? `${lo.toFixed(1)}–${hi.toFixed(1)}${unit}` : `max ${hi.toFixed(1)}${unit}/s`}
				</span>
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="bg-muted/40 w-full cursor-pointer border"
				onPointerDown={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const t = (((e.clientX - rect.left) / rect.width) * W - PAD) / (W - PAD * 2);
					onSeek(Math.max(0, Math.min(1, t)) * duration);
				}}
			>
				<path d={d} fill="none" stroke={mode === "value" ? "#22D3EE" : "#A78BFA"} strokeWidth={2} />
				{mode === "value" && keys.map((k) => <rect key={k.t} x={x(k.t) - 3} y={y(k.v) - 3} width={6} height={6} fill="#F59E0B" transform={`rotate(45 ${x(k.t)} ${y(k.v)})`} />)}
				<line x1={x(time)} x2={x(time)} y1={0} y2={H} stroke="#fff" strokeOpacity={0.5} />
			</svg>
		</div>
	);
}
