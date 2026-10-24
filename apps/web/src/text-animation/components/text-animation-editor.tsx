"use client";

import { useRef, useState, type ReactNode } from "react";
import { CurveEditor } from "@/motion-studio/components/curve-editor";
import { EASING_BEZIERS, EASING_NAMES } from "../easing";
import { TEXT_EFFECTS, getTextEffect } from "../effects";
import { createTextAnimation, defaultPhase } from "../evaluate";
import { renderAnimatedText } from "../render";
import type { TextStyleOverrides } from "../element-style";
import type { TextAnimationPreset } from "../presets";
import type { Direction, Easing, KeyframeProperty, StaggerOrder, TextAnimation, TextAnimationPhase, TextKeyframe, TextUnit } from "../types";
import { PreviewCanvas } from "@/text-library/components/text-preview-canvas";

/**
 * Properties for animated text (text clips and template slots): words,
 * font and colours, then In / Emphasis / Out with every phase setting, a
 * keyframes section and presets. Presentational: the caller decides how
 * changes are stored. `commit: false` is a live drag (preview only),
 * `commit: true` ends the gesture (one undo step).
 */
export interface TextAnimationEditorProps {
	params: Record<string, unknown>;
	onParams: (patch: Record<string, unknown>, commit: boolean) => void;
	animation: TextAnimation | undefined;
	onAnimation: (animation: TextAnimation | undefined, commit: boolean) => void;
	textStyle?: TextStyleOverrides;
	onTextStyle?: (style: TextStyleOverrides | undefined, commit: boolean) => void;
	fonts: string[];
	/** Seconds into the clip at the playhead (for "add key here"). */
	playhead: number;
	duration: number;
	presets: TextAnimationPreset[];
	onSavePreset: (name: string) => void;
	onApplyPreset: (preset: TextAnimationPreset, toAllSelected: boolean) => void;
	onDeletePreset: (id: string) => void;
	selectionCount: number;
	/** Rendered next to the text box (the Sinhala/Tamil input mode switch). */
	inputModeSlot?: ReactNode;
}

const UNITS: Array<{ id: TextUnit; label: string }> = [
	{ id: "grapheme", label: "Letters" },
	{ id: "word", label: "Words" },
	{ id: "line", label: "Lines" },
	{ id: "block", label: "Whole" },
];
const ORDERS: StaggerOrder[] = ["forward", "reverse", "center-out", "edges-in", "random(1)"];
const DIRECTIONS: Direction[] = ["left", "right", "up", "down", "in", "out"];
const KEY_PROPS: KeyframeProperty[] = ["opacity", "x", "y", "scale", "rotation", "skew", "blur", "tracking", "fill", "stroke"];
const KEY_DEFAULT: Record<KeyframeProperty, number | string> = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, skew: 0, blur: 0, tracking: 0, fill: "#FFFFFF", stroke: "#000000" };

const row = "grid grid-cols-[88px_1fr] items-center gap-2 text-xs";
const input = "border-input bg-background h-7 w-full rounded border px-1.5 text-xs";

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
	return (
		<section className="flex flex-col gap-2 border-b border-white/10 px-3 py-3">
			<header className="flex items-center justify-between">
				<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
				{right}
			</header>
			{children}
		</section>
	);
}

/** A slider that previews while dragging and commits on release. */
function Slider({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number, commit: boolean) => void; suffix?: string }) {
	return (
		<label className={row}>
			<span className="text-muted-foreground">{label}</span>
			<span className="flex items-center gap-2">
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					aria-label={label}
					onChange={(e) => onChange(Number(e.target.value), false)}
					onPointerUp={(e) => onChange(Number(e.currentTarget.value), true)}
					onKeyUp={(e) => onChange(Number(e.currentTarget.value), true)}
					className="h-1 min-w-0 flex-1 accent-[var(--primary,#4c8dff)]"
				/>
				<span className="w-12 text-right tabular-nums">
					{Number(value.toFixed(2))}
					{suffix}
				</span>
			</span>
		</label>
	);
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	return (
		<label className={row}>
			<span className="text-muted-foreground">{label}</span>
			<span className="flex items-center gap-2">
				<input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={label} />
				<span className="tabular-nums">{value}</span>
			</span>
		</label>
	);
}

function easingLabel(e: Easing): string {
	return Array.isArray(e) ? "custom" : e;
}

function EasingField({ value, onChange }: { value: Easing; onChange: (e: Easing, commit: boolean) => void }) {
	const [open, setOpen] = useState(Array.isArray(value));
	const latest = useRef<[number, number, number, number] | null>(null);
	const bezier: [number, number, number, number] = Array.isArray(value) ? value : (EASING_BEZIERS[value] ?? [0.33, 1, 0.68, 1]);
	return (
		<div className="flex flex-col gap-2">
			<label className={row}>
				<span className="text-muted-foreground">Easing</span>
				<span className="flex gap-1">
					<select
						className={input}
						value={easingLabel(value)}
						onChange={(e) => {
							if (e.target.value === "custom") {
								setOpen(true);
								onChange(bezier, true);
							} else onChange(e.target.value as Easing, true);
						}}
						aria-label="Easing"
					>
						{EASING_NAMES.map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
						<option value="custom">Custom curve…</option>
					</select>
					<button type="button" className="rounded border px-1.5 text-[10px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
						Curve
					</button>
				</span>
			</label>
			{open && (
				<div className="flex justify-center">
					<CurveEditor
						ease={bezier}
						onChange={(e) => {
							latest.current = [...e] as [number, number, number, number];
							onChange(latest.current, false);
						}}
						onCommit={() => onChange(latest.current ?? bezier, true)}
					/>
				</div>
			)}
		</div>
	);
}

function PhaseEditor({ which, phase, onChange }: { which: "in" | "emphasis" | "out"; phase: TextAnimationPhase | undefined; onChange: (p: TextAnimationPhase | undefined, commit: boolean) => void }) {
	const effects = TEXT_EFFECTS.filter((e) => e.phases.includes(which));
	const effect = getTextEffect(phase?.effect);
	const set = (patch: Partial<TextAnimationPhase>, commit = true) => {
		if (phase) onChange({ ...phase, ...patch }, commit);
	};
	return (
		<div className="flex flex-col gap-2" data-phase={which}>
			<label className={row}>
				<span className="text-muted-foreground">Effect</span>
				<select
					className={input}
					value={phase?.effect ?? "none"}
					aria-label={`${which} effect`}
					onChange={(e) => {
						const id = e.target.value;
						if (id === "none") onChange(undefined, true);
						else onChange({ ...defaultPhase(id, which), ...(phase ? { delay: phase.delay } : {}) }, true);
					}}
				>
					<option value="none">None</option>
					{effects.map((e) => (
						<option key={e.id} value={e.id}>
							{e.name}
						</option>
					))}
				</select>
			</label>
			{phase && effect && (
				<>
					<Slider label={which === "emphasis" ? "Loop length" : "Duration"} value={phase.duration} min={0.02} max={which === "emphasis" ? 6 : 3} step={0.01} suffix="s" onChange={(v, c) => set({ duration: v }, c)} />
					<Slider label="Delay" value={phase.delay} min={0} max={5} step={0.01} suffix="s" onChange={(v, c) => set({ delay: v }, c)} />
					<Slider label="Stagger" value={phase.stagger} min={0} max={1} step={0.005} suffix="s" onChange={(v, c) => set({ stagger: v }, c)} />
					<label className={row}>
						<span className="text-muted-foreground">Order</span>
						<select className={input} value={phase.staggerOrder.startsWith("random") ? "random(1)" : phase.staggerOrder} onChange={(e) => set({ staggerOrder: e.target.value as StaggerOrder })} aria-label="Stagger order">
							{ORDERS.map((o) => (
								<option key={o} value={o}>
									{o === "random(1)" ? "random" : o}
								</option>
							))}
						</select>
					</label>
					{(effect.directions?.length ?? 0) > 0 && (
						<label className={row}>
							<span className="text-muted-foreground">Direction</span>
							<span className="flex flex-wrap gap-1">
								{DIRECTIONS.filter((d) => effect.directions!.includes(d)).map((d) => (
									<button key={d} type="button" aria-pressed={phase.direction === d} onClick={() => set({ direction: d })} className={`rounded border px-1.5 py-0.5 text-[10px] ${phase.direction === d ? "bg-primary text-primary-foreground border-primary" : ""}`}>
										{d}
									</button>
								))}
							</span>
						</label>
					)}
					<EasingField value={phase.easing} onChange={(e, c) => set({ easing: e }, c)} />
					<Slider label="Intensity" value={phase.intensity} min={0} max={2} step={0.01} onChange={(v, c) => set({ intensity: v }, c)} />
					{Object.entries(effect.params ?? {}).map(([key, def]) => {
						const value = phase.params[key] ?? def;
						if (typeof def === "boolean")
							return (
								<label key={key} className={row}>
									<span className="text-muted-foreground">{key}</span>
									<input type="checkbox" checked={value === true} onChange={(e) => set({ params: { ...phase.params, [key]: e.target.checked } })} />
								</label>
							);
						if (typeof def === "string" && /^#/.test(def)) return <Color key={key} label={key} value={String(value)} onChange={(v) => set({ params: { ...phase.params, [key]: v } })} />;
						if (typeof def === "number")
							return <Slider key={key} label={key} value={Number(value)} min={Math.min(0, def * 4)} max={Math.max(1, def * 4)} step={0.01} onChange={(v, c) => set({ params: { ...phase.params, [key]: v } }, c)} />;
						return null;
					})}
				</>
			)}
		</div>
	);
}

function KeyframesEditor({ animation, onChange, playhead }: { animation: TextAnimation; onChange: (a: TextAnimation, commit: boolean) => void; playhead: number }) {
	const [prop, setProp] = useState<KeyframeProperty>("y");
	const kf = animation.keyframes ?? { tracks: {} };
	const keys = kf.tracks[prop] ?? [];
	const setKeys = (next: TextKeyframe[], commit = true) => onChange({ ...animation, keyframes: { ...kf, tracks: { ...kf.tracks, [prop]: next.length ? next.sort((a, b) => a.t - b.t) : undefined } } }, commit);
	const colour = prop === "fill" || prop === "stroke";
	return (
		<div className="flex flex-col gap-2">
			<label className={row}>
				<span className="text-muted-foreground">Property</span>
				<select className={input} value={prop} onChange={(e) => setProp(e.target.value as KeyframeProperty)} aria-label="Keyframe property">
					{KEY_PROPS.map((p) => (
						<option key={p} value={p}>
							{p}
							{kf.tracks[p]?.length ? ` (${kf.tracks[p]!.length})` : ""}
						</option>
					))}
				</select>
			</label>
			<Slider label="Key stagger" value={kf.stagger ?? 0} min={0} max={0.5} step={0.005} suffix="s" onChange={(v, c) => onChange({ ...animation, keyframes: { ...kf, stagger: v } }, c)} />
			{keys.map((k, i) => (
				<div key={`${i}-${k.t}`} className="grid grid-cols-[52px_1fr_92px_20px] items-center gap-1 text-[11px]">
					<input className={input} type="number" step={0.05} value={k.t} aria-label="Key time" onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, t: Number(e.target.value) } : x)))} />
					{colour ? (
						<input type="color" value={String(k.v)} aria-label="Key colour" onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, v: e.target.value.toUpperCase() } : x)))} />
					) : (
						<input className={input} type="number" step={0.05} value={Number(k.v)} aria-label="Key value" onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, v: Number(e.target.value) } : x)))} />
					)}
					<select className={input} value={easingLabel(k.easing ?? "linear")} aria-label="Key easing" onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, easing: e.target.value as Easing } : x)))}>
						{EASING_NAMES.map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
						{Array.isArray(k.easing) && <option value="custom">custom</option>}
					</select>
					<button type="button" aria-label="Delete key" onClick={() => setKeys(keys.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
						×
					</button>
				</div>
			))}
			<button type="button" className="rounded border px-2 py-1 text-[11px]" onClick={() => setKeys([...keys.filter((k) => Math.abs(k.t - playhead) > 1e-3), { t: Math.round(playhead * 100) / 100, v: KEY_DEFAULT[prop], easing: "ease-in-out" }])}>
				+ Key at playhead ({playhead.toFixed(2)}s)
			</button>
		</div>
	);
}

export function TextAnimationEditor(props: TextAnimationEditorProps) {
	const { params, onParams, animation, onAnimation, textStyle, onTextStyle, fonts } = props;
	const [tab, setTab] = useState<"in" | "emphasis" | "out" | "keys">("in");
	const [presetName, setPresetName] = useState("");
	const str = (key: string, fallback: string) => (typeof params[key] === "string" ? (params[key] as string) : fallback);
	const num = (key: string, fallback: number) => (typeof params[key] === "number" ? (params[key] as number) : fallback);
	const anim = animation ?? createTextAnimation({ unit: "word" });
	const setAnim = (patch: Partial<TextAnimation>, commit: boolean) => onAnimation({ ...anim, ...patch }, commit);
	const content = str("content", "");
	const family = str("fontFamily", "Inter");
	const familyOptions = [...new Set([family, ...fonts])];

	return (
		<div className="flex flex-col pb-6" data-text-animation-editor>
			<Section title="Preview">
				<div className="overflow-hidden rounded border border-white/10 bg-[repeating-conic-gradient(#1a1d24_0%_25%,#14171d_0%_50%)] bg-[length:16px_16px]">
					<PreviewCanvas
						width={264}
						height={96}
						duration={props.duration}
						playing
						drawKey={JSON.stringify([anim, content, params, textStyle])}
						draw={(ctx, t) =>
							renderAnimatedText({
								ctx,
								text: content || "Text",
								animation: anim,
								time: t,
								duration: props.duration,
								x: 132,
								y: 48,
								style: {
									fontFamily: family,
									fontWeight: str("fontWeight", "normal") === "bold" ? 700 : 400,
									fontSize: 26,
									tracking: num("letterSpacing", 0) / 26,
									lineHeight: num("lineHeight", 1.2),
									align: (str("textAlign", "center") as "left" | "center" | "right") ?? "center",
									fill: str("color", "#FFFFFF"),
									gradient: textStyle?.gradient ?? null,
									stroke: params["stroke.enabled"] === true ? { color: str("stroke.color", "#000000"), width: 2 } : null,
									glow: params["glow.enabled"] === true ? { color: str("glow.color", "#2EC4FF"), size: num("glow.size", 30) / 100 } : null,
									plate: params["background.enabled"] === true ? { color: str("background.color", "#000000"), padding: 0.3, radius: 0.15 } : null,
									maxWidth: 250,
								},
							})
						}
					/>
				</div>
			</Section>
			<Section title="Text">
				<div className="flex items-start gap-1">
					<textarea
						className="border-input bg-background min-h-[56px] flex-1 rounded border p-1.5 text-sm"
						value={content}
						aria-label="Text"
						onChange={(e) => onParams({ content: e.target.value }, false)}
						onBlur={(e) => onParams({ content: e.target.value }, true)}
						style={{ fontFamily: `"${family}", "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif` }}
					/>
					{props.inputModeSlot}
				</div>
				<label className={row}>
					<span className="text-muted-foreground">Font</span>
					<select className={input} value={family} onChange={(e) => onParams({ fontFamily: e.target.value }, true)} aria-label="Font family" style={{ fontFamily: family }}>
						{familyOptions.map((f) => (
							<option key={f} value={f}>
								{f}
							</option>
						))}
					</select>
				</label>
				<label className={row}>
					<span className="text-muted-foreground">Weight / align</span>
					<span className="flex gap-1">
						<select className={input} value={str("fontWeight", "normal")} onChange={(e) => onParams({ fontWeight: e.target.value }, true)} aria-label="Font weight">
							<option value="normal">Regular</option>
							<option value="bold">Bold</option>
						</select>
						<select className={input} value={str("textAlign", "center")} onChange={(e) => onParams({ textAlign: e.target.value }, true)} aria-label="Alignment">
							<option value="left">Left</option>
							<option value="center">Centre</option>
							<option value="right">Right</option>
						</select>
					</span>
				</label>
				<Slider label="Size" value={num("fontSize", 15)} min={1} max={120} step={0.5} onChange={(v, c) => onParams({ fontSize: v }, c)} />
				<Slider label="Tracking" value={num("letterSpacing", 0)} min={-10} max={60} step={0.1} onChange={(v, c) => onParams({ letterSpacing: v }, c)} />
				<Slider label="Line height" value={num("lineHeight", 1.2)} min={0.6} max={3} step={0.05} onChange={(v, c) => onParams({ lineHeight: v }, c)} />
			</Section>
			<Section title="Colours">
				<Color label="Fill" value={str("color", "#FFFFFF").toUpperCase()} onChange={(v) => onParams({ color: v }, true)} />
				<label className={row}>
					<span className="text-muted-foreground">Gradient</span>
					<span className="flex items-center gap-2">
						<input type="checkbox" checked={!!textStyle?.gradient} aria-label="Gradient fill" onChange={(e) => onTextStyle?.(e.target.checked ? { ...textStyle, gradient: [str("color", "#FFFFFF"), "#2EC4FF"] } : { ...textStyle, gradient: undefined }, true)} />
						{textStyle?.gradient && (
							<input type="color" value={textStyle.gradient[1] ?? "#2EC4FF"} aria-label="Gradient end colour" onChange={(e) => onTextStyle?.({ ...textStyle, gradient: [textStyle.gradient![0]!, e.target.value.toUpperCase()] }, true)} />
						)}
					</span>
				</label>
				{(
					[
						["stroke", "Stroke", "#000000"],
						["shadow", "Shadow", "#000000"],
						["glow", "Glow", "#2EC4FF"],
						["background", "Plate", "#000000"],
					] as const
				).map(([key, label, fallback]) => (
					<label key={key} className={row}>
						<span className="text-muted-foreground">{label}</span>
						<span className="flex items-center gap-2">
							<input type="checkbox" checked={params[`${key}.enabled`] === true} aria-label={`${label} on`} onChange={(e) => onParams({ [`${key}.enabled`]: e.target.checked }, true)} />
							<input type="color" value={str(`${key}.color`, fallback)} aria-label={`${label} colour`} disabled={params[`${key}.enabled`] !== true} onChange={(e) => onParams({ [`${key}.color`]: e.target.value.toUpperCase() }, true)} />
						</span>
					</label>
				))}
			</Section>
			<Section
				title="Animation"
				right={
					<button type="button" className="text-muted-foreground text-[11px] hover:underline" onClick={() => onAnimation(undefined, true)}>
						Reset
					</button>
				}
			>
				<label className={row}>
					<span className="text-muted-foreground">Animate by</span>
					<span className="flex gap-1">
						{UNITS.map((u) => (
							<button key={u.id} type="button" aria-pressed={anim.unit === u.id} onClick={() => setAnim({ unit: u.id }, true)} className={`rounded border px-1.5 py-0.5 text-[10px] ${anim.unit === u.id ? "bg-primary text-primary-foreground border-primary" : ""}`}>
								{u.label}
							</button>
						))}
					</span>
				</label>
				<div className="flex gap-3 border-b border-white/10 text-xs" role="tablist">
					{(["in", "emphasis", "out", "keys"] as const).map((t) => (
						<button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-1 ${tab === t ? "border-primary" : "text-muted-foreground border-transparent"}`}>
							{t === "in" ? "In" : t === "emphasis" ? "Emphasis" : t === "out" ? "Out" : "Keyframes"}
							{t !== "keys" && anim[t] ? " •" : ""}
						</button>
					))}
				</div>
				{tab === "keys" ? (
					<KeyframesEditor animation={anim} onChange={onAnimation} playhead={props.playhead} />
				) : (
					<PhaseEditor key={tab} which={tab} phase={anim[tab]} onChange={(p, commit) => setAnim({ [tab]: p }, commit)} />
				)}
			</Section>
			<Section title="Presets">
				<div className="flex gap-1">
					<input className={input} placeholder="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Preset name" />
					<button
						type="button"
						className="rounded border px-2 text-[11px]"
						disabled={!animation}
						onClick={() => {
							props.onSavePreset(presetName.trim() || "My text animation");
							setPresetName("");
						}}
					>
						Save as preset
					</button>
				</div>
				{props.presets.length === 0 && <p className="text-muted-foreground text-[11px]">Saved presets follow your account.</p>}
				{props.presets.map((p) => (
					<div key={p.id} className="flex items-center gap-2 text-[11px]">
						<span className="min-w-0 flex-1 truncate">{p.name}</span>
						<button type="button" className="text-primary hover:underline" onClick={() => props.onApplyPreset(p, false)}>
							Apply
						</button>
						{props.selectionCount > 1 && (
							<button type="button" className="text-primary hover:underline" onClick={() => props.onApplyPreset(p, true)}>
								Apply to {props.selectionCount}
							</button>
						)}
						<button type="button" aria-label={`Delete ${p.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => props.onDeletePreset(p.id)}>
							×
						</button>
					</div>
				))}
			</Section>
		</div>
	);
}
