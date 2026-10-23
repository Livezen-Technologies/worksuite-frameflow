"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import type { GradeTarget } from "@/color/grade-target";
import {
	curvesAt,
	keyFromCurves,
	parseCurveKeys,
	serializeCurveKeys,
	upsertKey,
} from "@/color/curve-keys";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import type { ParamValues } from "@/params";
import {
	CURVES_EFFECT_TYPE,
	readCurves,
	readQualifier,
} from "@/effects/definitions/curves";
import { cn } from "@/utils/ui";
import {
	type CurveChannel,
	type CurvePoint,
	DEFAULT_CURVES,
	DEFAULT_QUALIFIER,
	evaluateCurve,
	type HslQualifier,
	isHueChannel,
	serializeCurve,
} from "../curves";

const CHANNELS: { id: CurveChannel; label: string; stroke: string }[] = [
	{ id: "luma", label: "Luma", stroke: "#e5e7eb" },
	{ id: "red", label: "R", stroke: "#f87171" },
	{ id: "green", label: "G", stroke: "#4ade80" },
	{ id: "blue", label: "B", stroke: "#60a5fa" },
	{ id: "hueVsHue", label: "Hue vs Hue", stroke: "#e5e7eb" },
	{ id: "hueVsSat", label: "Hue vs Sat", stroke: "#e5e7eb" },
];

const SIZE = 240;
const HUE_GRADIENT =
	"linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

/** Drag points; click to add; double-click a point to remove it. */
function CurveEditor({
	points,
	channel,
	onChange,
	onCommit,
}: {
	points: CurvePoint[];
	channel: CurveChannel;
	onChange: (points: CurvePoint[]) => void;
	onCommit: (points: CurvePoint[]) => void;
}) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [drag, setDrag] = useState<number | null>(null);
	const hue = isHueChannel(channel);
	const stroke = CHANNELS.find((c) => c.id === channel)?.stroke ?? "#fff";

	const toPoint = (event: React.PointerEvent): CurvePoint => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return [0, 0];
		const x = Math.min(
			1,
			Math.max(0, (event.clientX - rect.left) / rect.width),
		);
		const y = Math.min(
			1,
			Math.max(0, 1 - (event.clientY - rect.top) / rect.height),
		);
		return [x, y];
	};

	const path = Array.from({ length: 97 }, (_, i) => {
		const x = i / 96;
		const y = evaluateCurve({ points, x, periodic: hue });
		return `${i === 0 ? "M" : "L"}${(x * SIZE).toFixed(1)},${((1 - y) * SIZE).toFixed(1)}`;
	}).join(" ");

	return (
		<div className="relative" style={{ width: SIZE, height: SIZE }}>
			<div
				className="absolute inset-0 rounded-md"
				style={{
					background: hue ? HUE_GRADIENT : "#0b0f17",
					opacity: hue ? 0.35 : 1,
				}}
			/>
			<svg
				ref={svgRef}
				width={SIZE}
				height={SIZE}
				className="relative touch-none rounded-md border"
				data-curve-editor={channel}
				onPointerDown={(event) => {
					if (event.target !== svgRef.current) return;
					const p = toPoint(event);
					const next = [...points, p].sort((a, b) => a[0] - b[0]);
					onChange(next);
					setDrag(next.indexOf(p));
					svgRef.current?.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					if (drag === null) return;
					const [x, y] = toPoint(event);
					const next = points.slice();
					const isEnd = !hue && (drag === 0 || drag === points.length - 1);
					// End points of tone curves stay at the edges.
					const lo = drag > 0 ? points[drag - 1][0] + 0.01 : 0;
					const hi = drag < points.length - 1 ? points[drag + 1][0] - 0.01 : 1;
					next[drag] = [
						isEnd ? points[drag][0] : Math.min(hi, Math.max(lo, x)),
						y,
					];
					onChange(next);
				}}
				onPointerUp={() => {
					if (drag !== null) onCommit(points);
					setDrag(null);
				}}
			>
				{[0.25, 0.5, 0.75].map((g) => (
					<g key={g} stroke="#ffffff22">
						<line x1={g * SIZE} x2={g * SIZE} y1={0} y2={SIZE} />
						<line y1={g * SIZE} y2={g * SIZE} x1={0} x2={SIZE} />
					</g>
				))}
				{hue ? (
					<line
						x1={0}
						x2={SIZE}
						y1={SIZE / 2}
						y2={SIZE / 2}
						stroke="#ffffff55"
						strokeDasharray="4 4"
					/>
				) : (
					<line
						x1={0}
						y1={SIZE}
						x2={SIZE}
						y2={0}
						stroke="#ffffff33"
						strokeDasharray="4 4"
					/>
				)}
				<path
					d={path}
					fill="none"
					stroke={stroke}
					strokeWidth={2}
					pointerEvents="none"
				/>
				{points.map(([x, y], i) => (
					<circle
						key={i}
						cx={x * SIZE}
						cy={(1 - y) * SIZE}
						r={6}
						fill={drag === i ? stroke : "#111827"}
						stroke={stroke}
						strokeWidth={2}
						className="cursor-grab"
						onPointerDown={(event) => {
							event.stopPropagation();
							setDrag(i);
							svgRef.current?.setPointerCapture(event.pointerId);
						}}
						onDoubleClick={() => {
							if (points.length <= 2) return;
							const next = points.filter((_, j) => j !== i);
							onChange(next);
							onCommit(next);
						}}
					/>
				))}
			</svg>
		</div>
	);
}

function Row({
	label,
	value,
	children,
}: {
	label: string;
	value?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex justify-between text-xs">
				<span>{label}</span>
				{value ? (
					<span className="text-muted-foreground tabular-nums">{value}</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

/** Curves and HSL qualifier for a clip or the timeline grade (SRS WS-09, WS-12). */
export function CurvesSection({
	target,
	effectId,
}: {
	target: GradeTarget;
	/** The node to edit; the first Curves node when unset. */
	effectId?: string;
}) {
	const editor = useEditor();
	const [channel, setChannel] = useState<CurveChannel>("luma");
	const playhead = useEditor((e) => e.playback.getCurrentTime());
	const liveEffects = target.effects;
	const effect = liveEffects.find((e) => (effectId ? e.id === effectId : e.type === CURVES_EFFECT_TYPE));

	if (!effect) {
		return (
			<div className="flex items-center justify-between gap-2 border-t px-1 py-3">
				<div className="text-sm">
					<div className="font-semibold">Curves &amp; HSL</div>
					<div className="text-muted-foreground text-xs">
						Luma, RGB and hue curves, colour qualifier
					</div>
				</div>
				<Button
					size="sm"
					variant="secondary"
					data-add-curves
					onClick={() => target.add(CURVES_EFFECT_TYPE)}
				>
					Add
				</Button>
			</div>
		);
	}

	const params = effect.params;
	const curves = readCurves(params);
	const q = readQualifier(params);

	const preview = (changes: ParamValues) =>
		target.preview(
			liveEffects.map((e) =>
				e.id === effect.id ? { ...e, params: { ...e.params, ...changes } } : e,
			),
		);
	const commit = (changes: ParamValues) =>
		target.setParams({ effectId: effect.id, params: { ...params, ...changes } });
	const curveKey = `curve.${channel}`;
	// Keyframed curves (WS-15): with keys, edits go into the key at the playhead.
	const keys = parseCurveKeys(params["curve.keys"]);
	const local = Math.max(0, (playhead - target.startTime) / TICKS_PER_SECOND);
	const shown = keys.length ? curvesAt({ keys, t: local, fallback: curves }) : curves;
	const curveChange = (points: CurvePoint[]): ParamValues =>
		keys.length
			? {
					"curve.keys": serializeCurveKeys(
						upsertKey({ keys, key: keyFromCurves({ t: local, curves: { ...shown, [channel]: points } }) }),
					),
				}
			: { [curveKey]: serializeCurve(points) };
	const keyHere = keys.find((k) => Math.abs(k.t - local) <= 1 / 60);
	const setQ = ({
		patch,
		done = true,
	}: {
		patch: Partial<HslQualifier>;
		done?: boolean;
	}) => {
		const changes = Object.fromEntries(
			Object.entries(patch).map(([k, v]) => [`hsl.${k}`, v]),
		);
		if (done) commit(changes);
		else preview(changes);
	};

	const qualifierSlider = ({
		label,
		keys,
		min,
		max,
		step = 0.01,
		format = (v: number) => `${Math.round(v * 100)}%`,
	}: {
		label: string;
		keys: (keyof HslQualifier)[];
		min: number;
		max: number;
		step?: number;
		format?: (v: number) => string;
	}) => {
		const values = keys.map((k) => Number(q[k]));
		const toPatch = (v: number[]) =>
			Object.fromEntries(keys.map((k, i) => [k, v[i]]));
		return (
			<Row label={label} value={values.map(format).join(" – ")}>
				<Slider
					min={min}
					max={max}
					step={step}
					value={values}
					onValueChange={(v) => setQ({ patch: toPatch(v), done: false })}
					onValueCommit={(v) => setQ({ patch: toPatch(v) })}
					aria-label={label}
				/>
			</Row>
		);
	};

	return (
		<div className="flex flex-col gap-3 border-t px-1 py-3" data-curves-section>
			<div className="flex items-center justify-between">
				<span className="text-sm font-semibold">Curves</span>
				<Button
					size="sm"
					variant="ghost"
					className="h-6 text-xs"
					onClick={() => commit(curveChange(DEFAULT_CURVES[channel]))}
				>
					Reset {CHANNELS.find((c) => c.id === channel)?.label}
				</Button>
			</div>
			<div className="flex flex-wrap gap-1">
				{CHANNELS.map((c) => (
					<button
						key={c.id}
						type="button"
						onClick={() => setChannel(c.id)}
						data-curve-channel={c.id}
						className={cn(
							"rounded border px-2 py-0.5 text-[11px]",
							channel === c.id
								? "border-primary bg-primary/15"
								: "hover:bg-accent",
						)}
					>
						{c.label}
					</button>
				))}
			</div>
			<CurveEditor
				key={channel}
				channel={channel}
				points={shown[channel]}
				onChange={(points) => preview(curveChange(points))}
				onCommit={(points) => commit(curveChange(points))}
			/>
			<div className="flex flex-wrap items-center gap-1 text-[11px]" data-curve-keys>
				<Button
					size="sm"
					variant={keyHere ? "secondary" : "outline"}
					className="h-6 text-[11px]"
					data-curve-key-add
					onClick={() =>
						commit({
							"curve.keys": serializeCurveKeys(
								upsertKey({ keys, key: keyFromCurves({ t: local, curves: shown }) }),
							),
						})
					}
				>
					{keyHere ? "◆ Key here" : "◇ Add key at playhead"}
				</Button>
				{keys.map((k) => (
					<span key={k.t} className="flex items-center rounded border" data-curve-key={k.t.toFixed(2)}>
						<button
							type="button"
							className="hover:bg-accent px-1.5"
							title="Go to this key"
							onClick={() =>
								editor.playback.seek({
									time: mediaTimeFromSeconds({ seconds: target.startTime / TICKS_PER_SECOND + k.t }),
								})
							}
						>
							{k.t.toFixed(2)} s
						</button>
						<button
							type="button"
							className="hover:bg-accent px-1"
							aria-label={`Delete key at ${k.t.toFixed(2)} s`}
							onClick={() =>
								commit({
									"curve.keys": serializeCurveKeys(keys.filter((x) => x !== k)),
									// The last key's curves stay as the still grade.
									...(keys.length === 1
										? Object.fromEntries(
												Object.entries(k.curves).map(([c, text]) => [`curve.${c}`, text]),
											)
										: {}),
								})
							}
						>
							×
						</button>
					</span>
				))}
				{keys.length === 1 && (
					<span className="text-muted-foreground">Move the playhead and add another key to animate.</span>
				)}
			</div>
			<p className="text-muted-foreground text-[11px] leading-snug">
				{isHueChannel(channel)
					? "Middle line is no change. Raise or lower a hue to shift it (Hue vs Hue) or change its saturation (Hue vs Sat)."
					: "Click to add a point, drag to shape, double-click a point to remove it."}
			</p>

			<div className="flex items-center justify-between border-t pt-3">
				<span className="text-sm font-semibold">HSL qualifier</span>
				<Switch
					checked={q.enabled}
					onCheckedChange={(on) => setQ({ patch: { enabled: on } })}
					aria-label="HSL qualifier"
				/>
			</div>
			{q.enabled && (
				<div className="flex flex-col gap-3" data-hsl-qualifier>
					<Row
						label="Hue"
						value={`${Math.round(q.hue * 360)}° ± ${Math.round(q.hueWidth * 180)}°`}
					>
						<div className="h-2 rounded" style={{ background: HUE_GRADIENT }} />
						<Slider
							min={0}
							max={1}
							step={0.005}
							value={[q.hue]}
							onValueChange={([v]) => setQ({ patch: { hue: v }, done: false })}
							onValueCommit={([v]) => setQ({ patch: { hue: v } })}
							aria-label="Hue centre"
						/>
					</Row>
					{qualifierSlider({
						label: "Hue width",
						keys: ["hueWidth"],
						min: 0.01,
						max: 1,
						format: (v) => `${Math.round(v * 360)}°`,
					})}
					{qualifierSlider({
						label: "Saturation range",
						keys: ["satMin", "satMax"],
						min: 0,
						max: 1,
					})}
					{qualifierSlider({
						label: "Luminance range",
						keys: ["lumMin", "lumMax"],
						min: 0,
						max: 1,
					})}
					{qualifierSlider({
						label: "Softness",
						keys: ["softness"],
						min: 0,
						max: 1,
					})}
					<div className="flex flex-wrap gap-4 text-xs">
						<div className="flex items-center gap-1.5">
							<Switch
								aria-label="Invert"
								checked={q.invert}
								onCheckedChange={(on) => setQ({ patch: { invert: on } })}
							/>
							Invert
						</div>
						<div className="flex items-center gap-1.5">
							<Switch
								aria-label="Show selection"
								checked={q.showMask}
								onCheckedChange={(on) => setQ({ patch: { showMask: on } })}
								data-show-mask
							/>
							Show selection
						</div>
					</div>
					<span className="text-muted-foreground text-[11px]">
						Inside the selection
					</span>
					{qualifierSlider({
						label: "Hue shift",
						keys: ["hueShift"],
						min: -0.5,
						max: 0.5,
						step: 0.005,
						format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 360)}°`,
					})}
					{qualifierSlider({
						label: "Saturation",
						keys: ["saturation"],
						min: 0,
						max: 2,
					})}
					{qualifierSlider({
						label: "Lightness",
						keys: ["lightness"],
						min: -0.5,
						max: 0.5,
						format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`,
					})}
					<Button
						size="sm"
						variant="ghost"
						className="self-start text-xs"
						onClick={() =>
							commit(
								Object.fromEntries(
									Object.entries({ ...DEFAULT_QUALIFIER, enabled: true }).map(
										([k, v]) => [`hsl.${k}`, v],
									),
								),
							)
						}
					>
						Reset qualifier
					</Button>
				</div>
			)}
		</div>
	);
}
