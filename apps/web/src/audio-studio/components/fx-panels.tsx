"use client";

import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { CLEANUP_PRESETS, type ClipFx, fxParams, getElementFx, MAX_BANDS, type PeqBand } from "@/timeline/audio-fx";
import type { AudioElement, VideoElement } from "@/timeline/types";
import { cn } from "@/utils/ui";

type Clip = { trackId: string; element: AudioElement | VideoElement };

function useFx(clip: Clip) {
	const editor = useEditor();
	const fx = getElementFx({ element: clip.element });
	const set = (patch: Partial<ClipFx>) =>
		editor.timeline.updateElements({
			updates: [{ trackId: clip.trackId, elementId: clip.element.id, patch: { params: { ...clip.element.params, ...fxParams(patch) } } }],
		});
	return { fx, set };
}

function Row({ label, value, unit, min, max, step = 1, onChange }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex justify-between text-xs">
				<span>{label}</span>
				<span className="text-muted-foreground tabular-nums">
					{value > 0 && unit === "dB" ? "+" : ""}
					{value} {unit}
				</span>
			</div>
			<Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v ?? 0)} />
		</div>
	);
}

/** Clean up voice (AE-04): one-click presets, then fine-tune each stage. */
export function CleanupTab({ clip }: { clip: Clip }) {
	const { fx, set } = useFx(clip);
	const active = CLEANUP_PRESETS.find(
		(p) => p.fx.noise === fx.noise && p.fx.echo === fx.echo && p.fx.comp === fx.comp && p.fx.deess === fx.deess && p.fx.lowCut === fx.eq.lowCut,
	);
	return (
		<div className="flex flex-col gap-4 p-3" data-studio-cleanup>
			<div className="grid grid-cols-2 gap-1.5">
				{CLEANUP_PRESETS.map((p) => (
					<button
						key={p.id}
						type="button"
						data-cleanup-preset={p.id}
						onClick={() => {
							const { lowCut, ...rest } = p.fx;
							set({ ...rest, eq: { ...fx.eq, lowCut } });
						}}
						className={cn("rounded-md border px-2 py-1.5 text-xs", active?.id === p.id ? "border-primary bg-primary/15" : "hover:bg-accent")}
					>
						{p.label}
					</button>
				))}
				<button
					type="button"
					onClick={() => set({ noise: 0, echo: 0, presence: 0, deess: 0, comp: 0, eq: { ...fx.eq, lowCut: 0 } })}
					className="hover:bg-accent rounded-md border px-2 py-1.5 text-xs"
				>
					Off
				</button>
			</div>
			<Row label="Noise reduction" value={fx.noise} unit="%" min={0} max={100} onChange={(noise) => set({ noise })} />
			<Row label="Echo removal" value={fx.echo} unit="%" min={0} max={100} onChange={(echo) => set({ echo })} />
			<Row label="Low cut" value={fx.eq.lowCut} unit="Hz" min={0} max={400} step={10} onChange={(lowCut) => set({ eq: { ...fx.eq, lowCut } })} />
			<Row label="Presence" value={fx.presence} unit="dB" min={-6} max={12} step={0.5} onChange={(presence) => set({ presence })} />
			<Row label="De-esser" value={fx.deess} unit="%" min={0} max={100} onChange={(deess) => set({ deess })} />
			<Row label="Compressor" value={fx.comp} unit="%" min={0} max={100} onChange={(comp) => set({ comp })} />
			<p className="text-muted-foreground m-0 text-xs">Non-destructive: heard in the preview and the export, and undo works.</p>
		</div>
	);
}

/** Dynamics (AE-05): compressor and limiter as clip effects. */
export function DynamicsTab({ clip }: { clip: Clip }) {
	const { fx, set } = useFx(clip);
	return (
		<div className="flex flex-col gap-4 p-3" data-studio-dynamics>
			<Row label="Compressor amount" value={fx.comp} unit="%" min={0} max={100} onChange={(comp) => set({ comp })} />
			<p className="text-muted-foreground m-0 text-xs">
				{fx.comp === 0
					? "Off."
					: `Threshold ${(-10 - fx.comp * 0.3).toFixed(0)} dB · ratio ${(1.5 + fx.comp * 0.065).toFixed(1)}:1 · make-up gain added automatically.`}
			</p>
			<label className="flex items-center gap-2 text-sm">
				<input type="checkbox" checked={fx.limiter} onChange={(e) => set({ limiter: e.target.checked })} data-studio-limiter />
				Limiter (ceiling −1 dB)
			</label>
		</div>
	);
}

const FMIN = 20;
const FMAX = 20000;
const GMAX = 18;

/** Parametric EQ (AE-05): drag points, double-click to add, right-click to remove. */
export function ParametricEq({ clip }: { clip: Clip }) {
	const { fx, set } = useFx(clip);
	const canvas = useRef<HTMLCanvasElement>(null);
	const [drag, setDrag] = useState<number | null>(null);
	const [dragBands, setBands] = useState<PeqBand[]>([]);
	// While dragging, draw the local copy; otherwise the stored bands.
	const bands = drag === null ? fx.bands : dragBands;

	const xOf = ([f, w]: [number, number]) => (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * w;
	const fOf = ([x, w]: [number, number]) => FMIN * (FMAX / FMIN) ** Math.max(0, Math.min(1, x / w));
	const yOf = ([g, h]: [number, number]) => h / 2 - (g / GMAX) * (h / 2 - 8);
	const gOf = ([y, h]: [number, number]) => Math.max(-GMAX, Math.min(GMAX, ((h / 2 - y) / (h / 2 - 8)) * GMAX));

	useEffect(() => {
		const el = canvas.current;
		const ctx = el?.getContext("2d");
		if (!el || !ctx) return;
		const w = (el.width = el.clientWidth * devicePixelRatio);
		const h = (el.height = el.clientHeight * devicePixelRatio);
		ctx.clearRect(0, 0, w, h);
		ctx.strokeStyle = "rgba(255,255,255,0.08)";
		ctx.lineWidth = 1;
		for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
			ctx.beginPath();
			ctx.moveTo(xOf([f, w]), 0);
			ctx.lineTo(xOf([f, w]), h);
			ctx.stroke();
		}
		for (const g of [-12, -6, 0, 6, 12]) {
			ctx.beginPath();
			ctx.moveTo(0, yOf([g, h]));
			ctx.lineTo(w, yOf([g, h]));
			ctx.stroke();
		}
		// The combined response of every band.
		const points = 200;
		const freqs = new Float32Array(points).map((_, i) => fOf([(i / (points - 1)) * w, w]));
		const total = new Float32Array(points);
		const off = new OfflineAudioContext(1, 1, 48000);
		for (const b of bands) {
			const bq = off.createBiquadFilter();
			bq.type = "peaking";
			bq.frequency.value = b.freq;
			bq.gain.value = b.gain;
			bq.Q.value = b.q;
			const mag = new Float32Array(points);
			bq.getFrequencyResponse(freqs, mag, new Float32Array(points));
			for (let i = 0; i < points; i++) total[i]! += 20 * Math.log10(mag[i]! || 1);
		}
		ctx.strokeStyle = "#7c5cff";
		ctx.lineWidth = 2 * devicePixelRatio;
		ctx.beginPath();
		for (let i = 0; i < points; i++) {
			const x = (i / (points - 1)) * w;
			const y = yOf([total[i]!, h]);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		bands.forEach((b, i) => {
			ctx.fillStyle = i === drag ? "#fff" : "#2fbf8f";
			ctx.beginPath();
			ctx.arc(xOf([b.freq, w]), yOf([b.gain, h]), 6 * devicePixelRatio, 0, Math.PI * 2);
			ctx.fill();
		});
	});

	const local = (e: React.PointerEvent | React.MouseEvent) => {
		const r = e.currentTarget.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
	};
	const hit = (e: React.PointerEvent | React.MouseEvent) => {
		const { x, y, w, h } = local(e);
		return bands.findIndex((b) => Math.hypot(xOf([b.freq, w]) - x, yOf([b.gain, h]) - y) < 10);
	};

	return (
		<div className="flex flex-col gap-2" data-studio-peq>
			<div className="flex items-center justify-between text-xs">
				<span className="font-semibold">Parametric EQ</span>
				<button
					type="button"
					disabled={bands.length >= MAX_BANDS}
					className="text-primary disabled:opacity-40"
					onClick={() => set({ bands: [...bands, { freq: 1000, gain: 3, q: 1 }] })}
					data-peq-add
				>
					+ Band
				</button>
			</div>
			<canvas
				ref={canvas}
				className="bg-muted/40 h-36 w-full cursor-crosshair touch-none rounded border"
				onPointerDown={(e) => {
					const i = hit(e);
					if (i < 0) return;
					e.currentTarget.setPointerCapture(e.pointerId);
					setBands(fx.bands);
					setDrag(i);
				}}
				onPointerMove={(e) => {
					if (drag === null) return;
					const { x, y, w, h } = local(e);
					setBands(bands.map((b, i) => (i === drag ? { ...b, freq: fOf([x, w]), gain: gOf([y, h]) } : b)));
				}}
				onPointerUp={() => {
					if (drag === null) return;
					set({ bands: dragBands });
					setDrag(null);
				}}
				onDoubleClick={(e) => {
					if (hit(e) >= 0 || bands.length >= MAX_BANDS) return;
					const { x, y, w, h } = local(e);
					set({ bands: [...bands, { freq: fOf([x, w]), gain: gOf([y, h]), q: 1 }] });
				}}
				onContextMenu={(e) => {
					const i = hit(e);
					if (i < 0) return;
					e.preventDefault();
					set({ bands: bands.filter((_, j) => j !== i) });
				}}
			/>
			{bands.map((b, i) => (
				<div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1 text-[11px]">
					<span className="tabular-nums">{b.freq < 1000 ? `${Math.round(b.freq)} Hz` : `${(b.freq / 1000).toFixed(1)} kHz`}</span>
					<span className="tabular-nums">{b.gain > 0 ? "+" : ""}{b.gain.toFixed(1)} dB</span>
					<input
						type="number"
						aria-label="Q"
						className="w-full rounded border bg-transparent px-1"
						min={0.2}
						max={12}
						step={0.1}
						value={b.q}
						onChange={(e) => set({ bands: bands.map((x, j) => (j === i ? { ...x, q: Number(e.target.value) || 1 } : x)) })}
					/>
					<button type="button" className="text-muted-foreground px-1" onClick={() => set({ bands: bands.filter((_, j) => j !== i) })}>
						×
					</button>
				</div>
			))}
			<p className="text-muted-foreground m-0 text-[11px]">Double-click the graph to add a band, drag to move it, right-click to remove.</p>
		</div>
	);
}
