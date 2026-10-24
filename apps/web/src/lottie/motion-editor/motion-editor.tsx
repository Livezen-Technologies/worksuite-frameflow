"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OVERLAY_CSS } from "@/asset-library/components/styles";
import type { PackIndexAsset } from "../catalog";
import { resolveSlotColors, setSlotColor } from "../element";
import { drawLottieFrame } from "../player";
import { namedLayers, slotText } from "../slots";
import { motionTimingDuration, motionTimingFrame } from "../timing";
import type { ImageSlotOverride, LottieElementData, LottieJson, TextSlotOverride } from "../types";
import {
	applyBrandKit,
	downscaleImage,
	setImageOverride,
	setLayerHidden,
	setSoundOverride,
	setTextOverride,
	setTiming,
} from "./overrides";

export interface MotionImageSource {
	id: string;
	name: string;
	load: () => Promise<Blob>;
}

export interface MotionEditorProps {
	data: LottieElementData;
	asset: PackIndexAsset | null;
	json: LottieJson;
	/** `commit` false while dragging a control (preview only), true when the edit is done. */
	onChange: (next: LottieElementData, commit: boolean) => void;
	onClose: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
	brandColors?: string[];
	brandFont?: string | null;
	brandLogo?: string | null;
	/** Font families to offer (installed fonts first). */
	fonts?: string[];
	mediaImages?: MotionImageSource[];
	onSavePreset?: (name: string, data: LottieElementData) => void;
	onLanguageChange?: (lang: string) => void;
}

const LANGS = [
	{ id: "en", label: "EN" },
	{ id: "si", label: "සිං" },
	{ id: "ta", label: "தமி" },
];
const WEIGHTS = [400, 500, 600, 700, 800];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type Selection = { kind: "text" | "image"; id: string } | { kind: "layer"; name: string } | null;

/**
 * The Motion Editor: a large preview with scrubber, the animation's
 * elements (slots and named layers), and controls for colours, words,
 * fonts, pictures, timing and sounds. Every change is an override on the
 * clip (see overrides.ts), applied through `onChange`.
 */
export function MotionEditor(props: MotionEditorProps) {
	const { data, asset, json, onChange, onClose, brandColors = [], fonts = [] } = props;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [selection, setSelection] = useState<Selection>(() => {
		const first = asset?.imageSlots?.[0] ?? null;
		if (first) return { kind: "image", id: first.id };
		const text = asset?.textSlots?.[0];
		return text ? { kind: "text", id: text.id } : null;
	});
	const [lang, setLang] = useState(data.source.kind === "pack" ? (data.source.variant ?? "en") : "en");

	const duration = motionTimingDuration({ fps: data.fps, frames: data.frames, speed: data.speed, timing: data.timing });
	const frameAt = (t: number) => motionTimingFrame({ clipSeconds: t, speed: data.speed, fps: data.fps, frames: data.frames, loop: data.loop, timing: data.timing ?? {} });

	// Playback clock.
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			setTime((t) => {
				const next = t + (now - last) / 1000;
				return next > duration ? 0 : next;
			});
			last = now;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, duration]);

	// Draw the current frame with the same renderer as preview and export.
	const frame = Math.round(frameAt(time) * 100) / 100;
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let cancelled = false;
		const offscreen = document.createElement("canvas");
		offscreen.width = canvas.width;
		offscreen.height = canvas.height;
		drawLottieFrame({ source: data.source, colors: data.colors, frame, target: offscreen, slots: data.slots })
			.then(() => {
				if (cancelled) return;
				const ctx = canvas.getContext("2d");
				ctx?.clearRect(0, 0, canvas.width, canvas.height);
				ctx?.drawImage(offscreen, 0, 0);
				const sel = selection;
				if (ctx && sel && sel.kind !== "layer" && asset) {
					const slot = sel.kind === "text" ? asset.textSlots?.find((s) => s.id === sel.id) : asset.imageSlots?.find((s) => s.id === sel.id);
					if (slot) {
						const s = Math.min(canvas.width / asset.width, canvas.height / asset.height);
						ctx.save();
						ctx.strokeStyle = "#4C8DFF";
						ctx.setLineDash([8, 6]);
						ctx.lineWidth = 2;
						ctx.strokeRect(slot.box.x * s, slot.box.y * s, slot.box.w * s, slot.box.h * s);
						ctx.restore();
					}
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [data, frame, selection, asset]);

	const elements = useMemo(() => namedLayers(json), [json]);
	const hidden = new Set(data.slots?.hidden ?? []);
	const colors = asset ? resolveSlotColors({ slots: asset.colors, overrides: data.colors }) : [];
	const canvasSize = useMemo(() => {
		const w = asset?.width ?? data.width;
		const h = asset?.height ?? data.height;
		const scale = Math.min(1, 1280 / w, 720 / h) * 1.5;
		return { width: Math.round(w * scale), height: Math.round(h * scale) };
	}, [asset, data.width, data.height]);

	const selectByPoint = (event: React.MouseEvent<HTMLCanvasElement>) => {
		if (!asset) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * asset.width;
		const y = ((event.clientY - rect.top) / rect.height) * asset.height;
		const inside = (b: { x: number; y: number; w: number; h: number }) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
		const image = asset.imageSlots?.find((s) => inside(s.box));
		if (image) return setSelection({ kind: "image", id: image.id });
		const text = asset.textSlots?.find((s) => inside(s.box));
		if (text) setSelection({ kind: "text", id: text.id });
	};

	const change = (next: LottieElementData, commit = true) => onChange(next, commit);

	// Focus the dialog when it opens, so Escape and Ctrl/Cmd+Z reach it at once.
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		rootRef.current?.focus({ preventScroll: true });
	}, []);

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			className="me-root"
			role="dialog"
			aria-label="Motion Editor"
			onKeyDown={(e) => {
				const mod = e.metaKey || e.ctrlKey;
				if (mod && e.key.toLowerCase() === "z") {
					e.preventDefault();
					if (e.shiftKey) props.onRedo?.();
					else props.onUndo?.();
				} else if (e.key === "Escape") onClose();
			}}
		>
			<style>{OVERLAY_CSS}</style>
			<div className="me-head">
				<span className="me-title">Motion Editor</span>
				<span className="me-hint">{asset?.name ?? "Animation"}</span>
				<div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
					{props.onUndo && (
						<button type="button" className="me-btn ghost" onClick={props.onUndo} title="Undo (Ctrl+Z)">
							Undo
						</button>
					)}
					{props.onRedo && (
						<button type="button" className="me-btn ghost" onClick={props.onRedo} title="Redo (Ctrl+Shift+Z)">
							Redo
						</button>
					)}
					{props.onSavePreset && (
						<button
							type="button"
							className="me-btn"
							onClick={() => {
								const name = window.prompt("Name for this asset", asset?.name ?? "My animation");
								if (name) props.onSavePreset?.(name, data);
							}}
						>
							Save as my asset
						</button>
					)}
					<button type="button" className="me-btn primary" onClick={onClose}>
						Done
					</button>
				</div>
			</div>
			<div className="me-body">
				<div className="me-list">
					{(asset?.textSlots?.length || asset?.imageSlots?.length) ? <div className="me-group">Editable</div> : null}
					{asset?.imageSlots?.map((slot) => (
						<ElementRow
							key={slot.id}
							label={slot.name}
							kind="Picture"
							current={selection?.kind === "image" && selection.id === slot.id}
							visible={!hidden.has(slot.layer)}
							onSelect={() => setSelection({ kind: "image", id: slot.id })}
							onToggle={(v) => change(setLayerHidden(data, slot.layer, !v))}
						/>
					))}
					{asset?.textSlots?.map((slot) => (
						<ElementRow
							key={slot.id}
							label={slot.name}
							kind="Text"
							current={selection?.kind === "text" && selection.id === slot.id}
							visible={!hidden.has(slot.layer)}
							onSelect={() => setSelection({ kind: "text", id: slot.id })}
							onToggle={(v) => change(setLayerHidden(data, slot.layer, !v))}
						/>
					))}
					<div className="me-group">Layers</div>
					{elements
						.filter((e) => e.kind === "layer")
						.map((layer) => (
							<ElementRow
								key={layer.name}
								label={layer.name}
								kind="Layer"
								current={selection?.kind === "layer" && selection.name === layer.name}
								visible={!hidden.has(layer.name)}
								onSelect={() => setSelection({ kind: "layer", name: layer.name })}
								onToggle={(v) => change(setLayerHidden(data, layer.name, !v))}
							/>
						))}
				</div>
				<div className="me-stage">
					<div className="me-canvas-wrap">
						<canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height} onClick={selectByPoint} aria-label="Preview" />
					</div>
					<div className="me-transport">
						<button type="button" className="me-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
							{playing ? "❚❚" : "▶"}
						</button>
						<input
							type="range"
							min={0}
							max={duration}
							step={1 / 60}
							value={Math.min(time, duration)}
							onChange={(e) => {
								setPlaying(false);
								setTime(Number(e.target.value));
							}}
							aria-label="Scrub"
						/>
						<span className="me-time">
							{time.toFixed(2)} / {duration.toFixed(2)} s
						</span>
					</div>
				</div>
				<div className="me-props">
					{selection?.kind === "image" && asset && (
						<ImageSlotPanel
							slot={asset.imageSlots?.find((s) => s.id === selection.id) ?? null}
							value={data.slots?.image?.[selection.id] ?? null}
							brandLogo={props.brandLogo ?? null}
							mediaImages={props.mediaImages ?? []}
							onChange={(value, commit) => change(setImageOverride(data, selection.id, value), commit)}
						/>
					)}
					{selection?.kind === "text" && asset && (
						<TextSlotPanel
							slot={asset.textSlots?.find((s) => s.id === selection.id) ?? null}
							value={data.slots?.text?.[selection.id] ?? {}}
							lang={lang}
							fonts={fonts}
							onLang={(l) => {
								setLang(l);
								props.onLanguageChange?.(l);
							}}
							onChange={(patch, commit) => change(setTextOverride(data, selection.id, patch), commit)}
						/>
					)}
					{asset && colors.length > 0 && (
						<section className="me-section">
							<h4>Colours</h4>
							<div className="me-colors">
								{colors.map((slot) => (
									<label key={slot.id} className="me-color">
										<input
											type="color"
											value={slot.value}
											onChange={(e) => change({ ...data, colors: setSlotColor({ overrides: data.colors, slot, color: e.target.value }) }, false)}
											onBlur={(e) => change({ ...data, colors: setSlotColor({ overrides: data.colors, slot, color: e.target.value }) })}
										/>
										<span style={{ flex: 1 }}>{slot.name}</span>
										<span className="me-swatches">
											{brandColors.slice(0, 6).map((c) => (
												<button
													key={c}
													type="button"
													className="me-swatch"
													style={{ background: c }}
													title={`Use ${c}`}
													onClick={() => change({ ...data, colors: setSlotColor({ overrides: data.colors, slot, color: c }) })}
												/>
											))}
										</span>
									</label>
								))}
							</div>
							<div style={{ display: "flex", gap: 6 }}>
								<button
									type="button"
									className="me-btn"
									disabled={!brandColors.length && !props.brandFont}
									onClick={() => change(applyBrandKit({ data, asset, brandColors, brandFont: props.brandFont }))}
								>
									Apply brand kit
								</button>
								<button type="button" className="me-btn ghost" disabled={!Object.keys(data.colors).length} onClick={() => change({ ...data, colors: {} })}>
									Reset colours
								</button>
							</div>
						</section>
					)}
					<section className="me-section">
						<h4>Timing</h4>
						<div className="me-two">
							<label className="me-field">
								Speed
								<select value={data.speed} onChange={(e) => change({ ...data, speed: Number(e.target.value) })}>
									{SPEEDS.map((s) => (
										<option key={s} value={s}>
											{s}×
										</option>
									))}
								</select>
							</label>
							<label className="me-field">
								Loop
								<select value={data.loop ? "yes" : "no"} onChange={(e) => change({ ...data, loop: e.target.value === "yes" })}>
									<option value="no">Play once</option>
									<option value="yes">Loop</option>
								</select>
							</label>
							<NumberField label="Delay (s)" value={data.timing?.delay ?? 0} onChange={(v) => change(setTiming(data, { delay: v }))} />
							<NumberField label="End hold (s)" value={data.timing?.endHold ?? 0} onChange={(v) => change(setTiming(data, { endHold: v }))} />
							<NumberField label="Trim start (s)" value={data.timing?.trimIn ?? 0} onChange={(v) => change(setTiming(data, { trimIn: v }))} />
							<NumberField label="Trim end (s)" value={data.timing?.trimOut ?? 0} onChange={(v) => change(setTiming(data, { trimOut: v }))} />
						</div>
					</section>
					{asset?.sounds && asset.sounds.length > 0 && (
						<section className="me-section">
							<h4>Sounds</h4>
							{asset.sounds.map((cue, i) => {
								const o = data.sounds?.[String(i)] ?? {};
								return (
									<div key={`${cue.id}-${cue.at}`} className="me-color">
										<span style={{ flex: 1 }}>
											{cue.id} @ {(cue.at + (o.nudge ?? 0)).toFixed(2)} s
										</span>
										<button type="button" className="me-btn ghost" onClick={() => change(setSoundOverride(data, i, { nudge: (o.nudge ?? 0) - 1 / 30 }))} title="Earlier by a frame">
											◂
										</button>
										<button type="button" className="me-btn ghost" onClick={() => change(setSoundOverride(data, i, { nudge: (o.nudge ?? 0) + 1 / 30 }))} title="Later by a frame">
											▸
										</button>
										<button type="button" className="me-btn" aria-pressed={!!o.muted} onClick={() => change(setSoundOverride(data, i, { muted: !o.muted }))}>
											{o.muted ? "Unmute" : "Mute"}
										</button>
									</div>
								);
							})}
							<p className="me-hint">Saved on the clip; used when its sounds are placed (existing sound clips are not changed).</p>
						</section>
					)}
				</div>
			</div>
		</div>
	);
}

function ElementRow({ label, kind, current, visible, onSelect, onToggle }: { label: string; kind: string; current: boolean; visible: boolean; onSelect: () => void; onToggle: (visible: boolean) => void }) {
	return (
		<div className="me-item" aria-current={current} onClick={onSelect} onKeyDown={(e) => e.key === "Enter" && onSelect()} role="button" tabIndex={0}>
			<span className="k">{kind}</span>
			<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label.replace(/^slot:(text|image):/, "")}</span>
			<button
				type="button"
				className="eye"
				aria-pressed={visible}
				aria-label={visible ? "Hide" : "Show"}
				onClick={(e) => {
					e.stopPropagation();
					onToggle(!visible);
				}}
			>
				{visible ? "◉" : "○"}
			</button>
		</div>
	);
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
	return (
		<label className="me-field">
			{label}
			<input type="number" min={0} step={0.1} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
		</label>
	);
}

function TextSlotPanel({
	slot,
	value,
	lang,
	fonts,
	onLang,
	onChange,
}: {
	slot: NonNullable<PackIndexAsset["textSlots"]>[number] | null;
	value: TextSlotOverride;
	lang: string;
	fonts: string[];
	onLang: (lang: string) => void;
	onChange: (patch: Partial<TextSlotOverride> | null, commit: boolean) => void;
}) {
	if (!slot) return null;
	const families = [...new Set([slot.fontFamily.split(",")[0].trim(), "Noto Sans Sinhala", "Noto Sans Tamil", ...fonts])];
	return (
		<section className="me-section">
			<h4>{slot.name}</h4>
			<div className="me-langs" role="group" aria-label="Language">
				{LANGS.map((l) => (
					<button key={l.id} type="button" className="me-btn" aria-pressed={lang === l.id} style={lang === l.id ? { borderColor: "#4c8dff" } : undefined} onClick={() => onLang(l.id)}>
						{l.label}
					</button>
				))}
			</div>
			<label className="me-field">
				Words
				<input
					type="text"
					lang={lang}
					value={value.text ?? slotText({ slot: { defaults: slot.defaults }, lang })}
					onChange={(e) => onChange({ text: e.target.value }, false)}
					onBlur={(e) => onChange({ text: e.target.value }, true)}
				/>
			</label>
			<div className="me-two">
				<label className="me-field">
					Font
					<select value={value.fontFamily ?? families[0]} onChange={(e) => onChange({ fontFamily: e.target.value === families[0] ? undefined : e.target.value }, true)}>
						{families.map((f) => (
							<option key={f} value={f}>
								{f}
							</option>
						))}
					</select>
				</label>
				<label className="me-field">
					Weight
					<select value={value.fontWeight ?? slot.fontWeight} onChange={(e) => onChange({ fontWeight: Number(e.target.value) }, true)}>
						{WEIGHTS.map((w) => (
							<option key={w} value={w}>
								{w}
							</option>
						))}
					</select>
				</label>
				<label className="me-field">
					Size
					<input type="range" min={0.5} max={1.5} step={0.05} value={value.sizeScale ?? 1} onChange={(e) => onChange({ sizeScale: Number(e.target.value) }, false)} onMouseUp={(e) => onChange({ sizeScale: Number((e.target as HTMLInputElement).value) }, true)} />
				</label>
				<label className="me-field">
					Letter spacing
					<input type="range" min={-0.05} max={0.3} step={0.01} value={value.letterSpacing ?? 0} onChange={(e) => onChange({ letterSpacing: Number(e.target.value) }, false)} onMouseUp={(e) => onChange({ letterSpacing: Number((e.target as HTMLInputElement).value) }, true)} />
				</label>
				<label className="me-field">
					Case
					<select value={value.case ?? (slot.uppercase ? "upper" : "as-typed")} onChange={(e) => onChange({ case: e.target.value as TextSlotOverride["case"] }, true)}>
						<option value="as-typed">As typed</option>
						<option value="upper">UPPER</option>
						<option value="lower">lower</option>
						<option value="title">Title</option>
					</select>
				</label>
				<label className="me-field">
					Colour
					<input type="color" value={value.color ?? "#ffffff"} onChange={(e) => onChange({ color: e.target.value.toUpperCase() }, true)} />
				</label>
			</div>
			<p className="me-hint">Type Sinhala or Tamil with the in-app input method (header). Text shrinks to fit its box.</p>
			<button type="button" className="me-btn ghost" onClick={() => onChange(null, true)}>
				Back to the original words
			</button>
		</section>
	);
}

function ImageSlotPanel({
	slot,
	value,
	brandLogo,
	mediaImages,
	onChange,
}: {
	slot: NonNullable<PackIndexAsset["imageSlots"]>[number] | null;
	value: ImageSlotOverride | null;
	brandLogo: string | null;
	mediaImages: MotionImageSource[];
	onChange: (value: ImageSlotOverride | null, commit: boolean) => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	if (!slot) return null;
	const put = async (blob: Blob, name?: string) => {
		const { src } = await downscaleImage(blob);
		onChange({ src, name, fit: "fill", zoom: 1, offsetX: 0, offsetY: 0, ...(value ? { fit: value.fit } : {}) }, true);
	};
	const set = (patch: Partial<ImageSlotOverride>, commit: boolean) => value && onChange({ ...value, ...patch }, commit);
	return (
		<section
			className="me-section"
			onPaste={(e) => {
				const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
				if (file) void put(file, "Pasted picture");
			}}
		>
			<h4>{slot.name}</h4>
			<div className="me-avatar">
				<div className="pic" style={value ? { backgroundImage: `url(${value.src})`, borderRadius: slot.mask.shape === "ellipse" ? "50%" : 8 } : undefined} />
				<div className="me-hint">Put a channel profile photo or logo here. It follows the animation and is clipped to the {slot.mask.shape === "ellipse" ? "circle" : "shape"}.</div>
			</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
				<button type="button" className="me-btn primary" onClick={() => fileRef.current?.click()}>
					Choose picture…
				</button>
				{brandLogo && (
					<button type="button" className="me-btn" onClick={() => void fetch(brandLogo).then((r) => r.blob()).then((b) => put(b, "Brand logo"))}>
						Brand logo
					</button>
				)}
				{value && (
					<button type="button" className="me-btn ghost" onClick={() => onChange(null, true)}>
						Remove
					</button>
				)}
			</div>
			<input
				ref={fileRef}
				type="file"
				accept="image/*"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void put(file, file.name);
					e.target.value = "";
				}}
			/>
			{mediaImages.length > 0 && (
				<label className="me-field">
					From the media bin
					<select defaultValue="" onChange={(e) => {
						const item = mediaImages.find((m) => m.id === e.target.value);
						if (item) void item.load().then((b) => put(b, item.name));
					}}>
						<option value="" disabled>
							Pick an image…
						</option>
						{mediaImages.map((m) => (
							<option key={m.id} value={m.id}>
								{m.name}
							</option>
						))}
					</select>
				</label>
			)}
			<p className="me-hint">Or paste an image (Ctrl+V) while this panel is focused.</p>
			{value && (
				<div className="me-two">
					<label className="me-field">
						Fit
						<select value={value.fit} onChange={(e) => set({ fit: e.target.value as ImageSlotOverride["fit"] }, true)}>
							<option value="fill">Fill (crop)</option>
							<option value="fit">Fit (whole picture)</option>
						</select>
					</label>
					<label className="me-field">
						Zoom
						<input type="range" min={1} max={3} step={0.05} value={value.zoom} onChange={(e) => set({ zoom: Number(e.target.value) }, false)} onMouseUp={(e) => set({ zoom: Number((e.target as HTMLInputElement).value) }, true)} />
					</label>
					<label className="me-field">
						Left / right
						<input type="range" min={-0.5} max={0.5} step={0.01} value={value.offsetX} onChange={(e) => set({ offsetX: Number(e.target.value) }, false)} onMouseUp={(e) => set({ offsetX: Number((e.target as HTMLInputElement).value) }, true)} />
					</label>
					<label className="me-field">
						Up / down
						<input type="range" min={-0.5} max={0.5} step={0.01} value={value.offsetY} onChange={(e) => set({ offsetY: Number(e.target.value) }, false)} onMouseUp={(e) => set({ offsetY: Number((e.target as HTMLInputElement).value) }, true)} />
					</label>
				</div>
			)}
		</section>
	);
}
