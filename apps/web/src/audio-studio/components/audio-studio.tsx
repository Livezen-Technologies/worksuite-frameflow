"use client";

import {
	Copy,
	FileAudio,
	Pause,
	Play,
	Plus,
	Redo2,
	Scissors,
	SkipBack,
	SkipForward,
	Square,
	Trash2,
	Undo2,
	Upload,
	Wand2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cleanUpClipVoice, restoreOriginalVoice, trimClipSilence } from "@/audio-tools/actions";
import { AudioBasicTab } from "@/audio-tools/components/audio-basic-tab";
import { VoiceChangerTab } from "@/audio-tools/components/voice-changer-tab";
import { Timeline } from "@/timeline/components";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { formatDuration } from "@/recording/session";
import { SpeedTab } from "@/speed/components/speed-tab";
import { getElementEq, type ClipEq } from "@/timeline/audio-state";
import type { AudioElement, TimelineTrack, VideoElement } from "@/timeline/types";
import { cn } from "@/utils/ui";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import { importAudio, normalizeClip, setClipLoudness } from "../actions";
import { EQ_PRESETS } from "../eq-presets";
import { useStudioStore } from "../store";

type AudioClip = AudioElement | VideoElement;
type InspectorTab = "process" | "eq" | "basic" | "voice" | "speed";

const EQ_KEYS: (keyof ClipEq)[] = ["low", "mid", "high", "lowCut"];
const TRACK_COLORS = ["#7c5cff", "#ef6461", "#4f86c6", "#2fbf8f", "#e8a33d", "#d65db1"];

/**
 * The Music & Audio Editor: a studio view of the same project, so every
 * edit is on the video timeline too. Tracks with mute and solo, a live
 * spectrum and output meter, the multi-track timeline with waveforms, and
 * an inspector for clean-up, EQ, volume and fades, voice and speed.
 */
export function AudioStudio() {
	const editor = useEditor();
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const selected = useEditor((e) => e.selection.getSelectedElements());
	const [tab, setTab] = useState<InspectorTab>("process");
	const fileInput = useRef<HTMLInputElement>(null);

	const audioTracks = tracks.audio;
	const clip = selectedAudioClip({ selected, tracks: [tracks.main, ...tracks.overlay, ...tracks.audio] });

	const splitAtPlayhead = () => {
		const refs = selected.length ? selected : [];
		if (refs.length === 0) return toast.info("Select a clip to split");
		editor.timeline.splitElements({ elements: refs, splitTime: editor.playback.getCurrentTime() });
	};

	return (
		<div className="flex size-full min-h-0 flex-col gap-2 px-3 pb-3" data-audio-studio>
			<div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)_300px] gap-2">
				{/* Left: media and tracks */}
				<aside className="bg-panel flex min-h-0 flex-col gap-3 overflow-y-auto rounded-md border p-3 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Tracks</span>
						<Button
							size="sm"
							variant="ghost"
							className="h-7 px-2"
							onClick={() => editor.timeline.addTrack({ type: "audio" })}
							data-studio-add-track
						>
							<Plus className="size-3.5" /> Track
						</Button>
					</div>
					{audioTracks.length === 0 && (
						<p className="text-muted-foreground m-0 text-xs">No audio tracks yet. Import music or a voice to start.</p>
					)}
					{audioTracks.map((track, index) => (
						<TrackRow key={track.id} track={track} index={index} allTracks={audioTracks} />
					))}
					<Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} data-studio-import>
						<Upload className="size-3.5" /> Import audio
					</Button>
					<input
						ref={fileInput}
						type="file"
						accept="audio/*,video/*"
						multiple
						className="hidden"
						onChange={(e) => {
							const files = [...(e.target.files ?? [])];
							e.target.value = "";
							void importAudio({ editor, files })
								.then((n) => n && toast.success(`Added ${n} file${n === 1 ? "" : "s"} at the playhead`))
								.catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
						}}
					/>
					<div className="mt-auto flex flex-col gap-1 border-t pt-3">
						<span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Selected clip</span>
						{clip ? (
							<div className="bg-accent/50 flex items-center gap-2 rounded-md p-2">
								<FileAudio className="size-4 shrink-0" />
								<div className="min-w-0">
									<div className="truncate text-sm">{clip.element.name}</div>
									<div className="text-muted-foreground text-xs">
										Start {formatDuration(clip.element.startTime / TICKS_PER_SECOND)} ·{" "}
										{formatDuration(clip.element.duration / TICKS_PER_SECOND)}
									</div>
								</div>
							</div>
						) : (
							<span className="text-muted-foreground text-xs">Click a clip on the timeline.</span>
						)}
					</div>
				</aside>

				{/* Centre: visualizer, toolbar, multi-track timeline */}
				<div className="flex min-h-0 min-w-0 flex-col gap-2">
					<div className="grid h-36 shrink-0 grid-cols-[minmax(0,1fr)_200px] gap-2">
						<Spectrum />
						<OutputMeter />
					</div>
					<div className="bg-panel flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5" data-studio-toolbar>
						<ToolButton label="Undo" onClick={() => editor.command.undo()}>
							<Undo2 />
						</ToolButton>
						<ToolButton label="Redo" onClick={() => editor.command.redo()}>
							<Redo2 />
						</ToolButton>
						<span className="bg-border mx-1 h-5 w-px" />
						<ToolButton label="Split at playhead" onClick={splitAtPlayhead}>
							<Scissors />
						</ToolButton>
						<ToolButton label="Duplicate" onClick={() => selected.length && editor.timeline.duplicateElements({ elements: selected })}>
							<Copy />
						</ToolButton>
						<ToolButton label="Delete" onClick={() => selected.length && editor.timeline.deleteElements({ elements: selected })}>
							<Trash2 />
						</ToolButton>
						<span className="bg-border mx-1 h-5 w-px" />
						<Button
							size="sm"
							variant="ghost"
							disabled={!clip}
							onClick={() =>
								clip &&
								editor.timeline.updateElements({
									updates: [
										{
											trackId: clip.trackId,
											elementId: clip.element.id,
											patch: { params: { ...clip.element.params, fadeIn: 0.5, fadeOut: 0.5 } },
										},
									],
								})
							}
						>
							Fade
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={!clip}
							data-studio-normalize
							onClick={() =>
								clip &&
								void normalizeClip({ editor, element: clip.element, trackId: clip.trackId })
									.then((db) => toast.success(`Normalized (${db >= 0 ? "+" : ""}${db.toFixed(1)} dB)`))
									.catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)))
							}
						>
							Normalize
						</Button>
						<Button size="sm" variant="ghost" disabled={!clip} onClick={() => setTab("process")}>
							<Wand2 className="size-3.5" /> Process tools
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="ml-auto"
							onClick={() => useStudioStore.getState().setStudio("video")}
							data-studio-to-video
						>
							Open in video editor
						</Button>
					</div>
					<div className="bg-panel min-h-0 flex-1 overflow-hidden rounded-md border">
						<Timeline />
					</div>
				</div>

				{/* Right: inspector */}
				<aside className="bg-panel flex min-h-0 flex-col overflow-hidden rounded-md border text-sm" data-studio-inspector>
					<div className="grid grid-cols-5 gap-0.5 border-b p-1">
						{(
							[
								["process", "Process"],
								["eq", "EQ"],
								["basic", "Volume"],
								["voice", "Voice"],
								["speed", "Speed"],
							] as const
						).map(([id, label]) => (
							<button
								key={id}
								type="button"
								onClick={() => setTab(id)}
								className={cn(
									"rounded py-1.5 text-xs",
									tab === id ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:bg-accent/50",
								)}
								data-studio-tab={id}
							>
								{label}
							</button>
						))}
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{!clip ? (
							<p className="text-muted-foreground m-0 p-4 text-xs">Select an audio clip (or a video with sound) to edit it.</p>
						) : tab === "process" ? (
							<ProcessTab clip={clip} />
						) : tab === "eq" ? (
							<EqTab clip={clip} />
						) : tab === "basic" ? (
							clip.element.type === "audio" ? (
								<AudioBasicTab element={clip.element} trackId={clip.trackId} />
							) : (
								<p className="text-muted-foreground m-0 p-4 text-xs">Volume and fades for video clips are under Audio in the video editor.</p>
							)
						) : tab === "voice" ? (
							<VoiceChangerTab element={clip.element} trackId={clip.trackId} />
						) : (
							<SpeedTab element={clip.element} trackId={clip.trackId} />
						)}
					</div>
				</aside>
			</div>
			<Transport />
		</div>
	);
}

/** The first selected clip that has sound (an audio clip or a video). */
function selectedAudioClip({
	selected,
	tracks,
}: {
	selected: { trackId: string; elementId: string }[];
	tracks: TimelineTrack[];
}): { trackId: string; element: AudioClip } | null {
	for (const ref of selected) {
		const element = tracks.find((t) => t.id === ref.trackId)?.elements.find((e) => e.id === ref.elementId);
		if (element && (element.type === "audio" || element.type === "video")) return { trackId: ref.trackId, element };
	}
	return null;
}

function TrackRow({ track, index, allTracks }: { track: TimelineTrack; index: number; allTracks: TimelineTrack[] }) {
	const editor = useEditor();
	const muted = "muted" in track && track.muted === true;
	const color = TRACK_COLORS[index % TRACK_COLORS.length];
	const others = allTracks.filter((t) => t.id !== track.id);
	const soloed = !muted && others.length > 0 && others.every((t) => "muted" in t && t.muted === true);
	const solo = () => {
		// Solo: mute every other audio track; solo again to hear them all.
		for (const other of others) {
			const otherMuted = "muted" in other && other.muted === true;
			if (soloed ? otherMuted : !otherMuted) editor.timeline.toggleTrackMute({ trackId: other.id });
		}
		if (muted) editor.timeline.toggleTrackMute({ trackId: track.id });
	};
	return (
		<div className="bg-accent/40 flex items-center gap-2 rounded-md p-2" data-studio-track={index}>
			<span className="flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white" style={{ background: color }}>
				{index + 1}
			</span>
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium">{track.elements[0]?.name ?? `Audio ${index + 1}`}</div>
				<div className="text-muted-foreground text-[11px]">
					{track.elements.length} clip{track.elements.length === 1 ? "" : "s"}
				</div>
			</div>
			<button
				type="button"
				onClick={() => editor.timeline.toggleTrackMute({ trackId: track.id })}
				className={cn("size-6 rounded text-[11px] font-bold", muted ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground")}
				title="Mute"
				aria-pressed={muted}
			>
				M
			</button>
			<button
				type="button"
				onClick={solo}
				className={cn("size-6 rounded text-[11px] font-bold", soloed ? "bg-emerald-500 text-black" : "bg-muted text-muted-foreground")}
				title="Solo"
				aria-pressed={soloed}
			>
				S
			</button>
			<button
				type="button"
				onClick={() => editor.timeline.removeTrack({ trackId: track.id })}
				className="text-muted-foreground hover:text-foreground size-6"
				title="Remove track"
			>
				<X className="mx-auto size-3.5" />
			</button>
		</div>
	);
}

function ProcessTab({ clip }: { clip: { trackId: string; element: AudioClip } }) {
	const editor = useEditor();
	const [busy, setBusy] = useState<string | null>(null);
	const run = async ({ name, work }: { name: string; work: () => Promise<string> }) => {
		setBusy(name);
		try {
			toast.success(await work());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "That didn't work");
		} finally {
			setBusy(null);
		}
	};
	const audio = clip.element.type === "audio" ? clip.element : null;
	return (
		<div className="flex flex-col gap-2 p-3" data-studio-process>
			<p className="text-muted-foreground m-0 text-xs">AI clean-up runs on this computer. Undo brings back the original.</p>
			{audio &&
				(audio.voiceCleanup ? (
					<Button variant="outline" onClick={() => restoreOriginalVoice({ editor, element: audio })}>
						Use the original voice
					</Button>
				) : (
					<Button
						className="bg-gradient-to-r from-emerald-400 to-yellow-300 text-black"
						disabled={!!busy}
						onClick={() =>
							void run({ name: "clean", work: async () => {
								await cleanUpClipVoice({ editor, element: audio });
								return "Voice cleaned up: noise removed, speech clearer, levels evened";
							} })
						}
						data-studio-clean
					>
						{busy === "clean" ? "Cleaning up…" : "Clean up voice (AI)"}
					</Button>
				))}
			<div className="grid grid-cols-2 gap-2">
				{audio && (
					<Button
						variant="outline"
						size="sm"
						disabled={!!busy}
						onClick={() =>
							void run({ name: "trim", work: async () => {
								const removed = await trimClipSilence({ editor, element: audio, trackId: clip.trackId, shortenPauses: true });
								return removed > 0.01 ? `Removed ${removed.toFixed(1)} s of silence` : "No silence to remove";
							} })
						}
					>
						Remove silences
					</Button>
				)}
				<Button
					variant="outline"
					size="sm"
					disabled={!!busy}
					onClick={() =>
						void run({ name: "loud", work: async () => {
							const db = await setClipLoudness({ editor, element: clip.element, trackId: clip.trackId });
							return `Loudness set to about −16 LUFS (${db >= 0 ? "+" : ""}${db.toFixed(1)} dB)`;
						} })
					}
					data-studio-loudness
				>
					Set loudness
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={!!busy}
					onClick={() =>
						void run({ name: "norm", work: async () => {
							const db = await normalizeClip({ editor, element: clip.element, trackId: clip.trackId });
							return `Normalized (${db >= 0 ? "+" : ""}${db.toFixed(1)} dB)`;
						} })
					}
				>
					Normalize peaks
				</Button>
			</div>
			<span className="text-muted-foreground mt-2 text-xs font-semibold tracking-wider uppercase">Presets</span>
			<div className="grid grid-cols-2 gap-1.5">
				{EQ_PRESETS.slice(1, 7).map((preset) => (
					<Button key={preset.id} size="sm" variant="ghost" className="bg-accent/50 justify-start" onClick={() => writeEq({ editor, clip, eq: preset.eq })}>
						{preset.label}
					</Button>
				))}
			</div>
		</div>
	);
}

function writeEq({
	editor,
	clip,
	eq,
}: {
	editor: EditorCore;
	clip: { trackId: string; element: AudioClip };
	eq: ClipEq;
}) {
	editor.timeline.updateElements({
		updates: [
			{
				trackId: clip.trackId,
				elementId: clip.element.id,
				patch: {
					params: { ...clip.element.params, "eq.low": eq.low, "eq.mid": eq.mid, "eq.high": eq.high, "eq.lowCut": eq.lowCut },
				},
			},
		],
	});
}

function EqTab({ clip }: { clip: { trackId: string; element: AudioClip } }) {
	const editor = useEditor();
	const eq = getElementEq({ element: clip.element });
	const set = (patch: Partial<ClipEq>) => writeEq({ editor, clip, eq: { ...eq, ...patch } });
	const bands: { key: keyof ClipEq; label: string; min: number; max: number; unit: string }[] = [
		{ key: "low", label: "Low (bass)", min: -24, max: 24, unit: "dB" },
		{ key: "mid", label: "Mid (voice)", min: -24, max: 24, unit: "dB" },
		{ key: "high", label: "High (treble)", min: -24, max: 24, unit: "dB" },
		{ key: "lowCut", label: "Low cut", min: 0, max: 600, unit: "Hz" },
	];
	return (
		<div className="flex flex-col gap-4 p-3" data-studio-eq>
			<div className="grid grid-cols-2 gap-1.5">
				{EQ_PRESETS.map((preset) => {
					const on = EQ_KEYS.every((k) => preset.eq[k] === eq[k]);
					return (
						<button
							key={preset.id}
							type="button"
							onClick={() => set(preset.eq)}
							className={cn("rounded-md border px-2 py-1.5 text-xs", on ? "border-primary bg-primary/15" : "hover:bg-accent")}
							data-eq-preset={preset.id}
						>
							{preset.label}
						</button>
					);
				})}
			</div>
			{bands.map((band) => (
				<div key={band.key} className="flex flex-col gap-1.5">
					<div className="flex justify-between text-xs">
						<span>{band.label}</span>
						<span className="text-muted-foreground tabular-nums">
							{band.key !== "lowCut" && eq[band.key] > 0 ? "+" : ""}
							{eq[band.key]} {band.unit}
						</span>
					</div>
					<Slider
						min={band.min}
						max={band.max}
						step={band.key === "lowCut" ? 10 : 1}
						value={[eq[band.key]]}
						onValueChange={([v]) => set({ [band.key]: v ?? 0 })}
					/>
				</div>
			))}
			<p className="text-muted-foreground m-0 text-xs">Heard in the preview and the export.</p>
		</div>
	);
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<Button size="icon" variant="ghost" className="size-8 [&_svg]:size-4" onClick={onClick} title={label} aria-label={label}>
			{children}
		</Button>
	);
}

/** Live spectrum of what's playing (the project's mixed output). */
function Spectrum() {
	const editor = useEditor();
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let raf = 0;
		const draw = () => {
			raf = requestAnimationFrame(draw);
			const el = canvas.current;
			const ctx = el?.getContext("2d");
			if (!el || !ctx) return;
			const w = Math.round(el.clientWidth * devicePixelRatio);
			const h = Math.round(el.clientHeight * devicePixelRatio);
			if (el.width !== w) el.width = w;
			if (el.height !== h) el.height = h;
			ctx.clearRect(0, 0, w, h);
			const analyser = editor.playback.getIsPlaying() ? editor.audio.getAnalyser() : null;
			const bars = 48;
			const data = new Uint8Array(analyser?.frequencyBinCount ?? 1024);
			analyser?.getByteFrequencyData(data);
			const gap = 3 * devicePixelRatio;
			const bw = (w - gap * (bars - 1)) / bars;
			for (let i = 0; i < bars; i++) {
				// Log-spaced bins so bass and treble both get room.
				const bin = Math.min(data.length - 1, Math.floor(2 ** ((i / bars) * Math.log2(data.length / 2)) + 1));
				const v = analyser ? data[bin]! / 255 : 0.05 + 0.04 * Math.sin(i / 3);
				const bh = Math.max(3 * devicePixelRatio, v * (h - 8));
				ctx.fillStyle = `hsl(${(i / bars) * 300 + 10}, 80%, 60%)`;
				ctx.beginPath();
				ctx.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
				ctx.fill();
			}
		};
		draw();
		return () => cancelAnimationFrame(raf);
	}, [editor]);
	return (
		<div className="bg-panel flex min-w-0 flex-col rounded-md border p-2" data-studio-spectrum>
			<span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Beat visualizer</span>
			<div className="relative min-h-0 flex-1">
				<canvas ref={canvas} className="absolute inset-0 size-full" />
			</div>
		</div>
	);
}

/** Output level and peak, in dBFS. */
function OutputMeter() {
	const editor = useEditor();
	const [level, setLevel] = useState({ rms: -90, peak: -90 });
	useEffect(() => {
		let raf = 0;
		let held = -90;
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const analyser = editor.playback.getIsPlaying() ? editor.audio.getAnalyser() : null;
			if (!analyser) {
				setLevel((l) => (l.rms === -90 ? l : { rms: -90, peak: -90 }));
				return;
			}
			const buf = new Float32Array(analyser.fftSize);
			analyser.getFloatTimeDomainData(buf);
			let sum = 0;
			let peak = 0;
			for (const v of buf) {
				sum += v * v;
				peak = Math.max(peak, Math.abs(v));
			}
			const rms = sum > 0 ? 10 * Math.log10(sum / buf.length) : -90;
			const peakDb = peak > 0 ? 20 * Math.log10(peak) : -90;
			held = Math.max(peakDb, held - 0.5);
			setLevel({ rms, peak: held });
		};
		tick();
		return () => cancelAnimationFrame(raf);
	}, [editor]);
	const pct = (db: number) => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
	return (
		<div className="bg-panel flex flex-col gap-2 rounded-md border p-2 text-xs" data-studio-meter>
			<span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Output meter</span>
			<div className="flex flex-1 items-end gap-2">
				{[level.rms, level.peak].map((db, i) => (
					<div key={i} className="bg-muted relative h-full flex-1 overflow-hidden rounded">
						<div
							className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-emerald-500 via-yellow-400 to-red-500"
							style={{ height: pct(db) }}
						/>
					</div>
				))}
			</div>
			<span className="text-muted-foreground tabular-nums">
				Level {level.rms > -89 ? level.rms.toFixed(1) : "−∞"} dB · Peak {level.peak > -89 ? level.peak.toFixed(1) : "−∞"} dB
			</span>
		</div>
	);
}

function Transport() {
	const editor = useEditor();
	const playing = useEditor((e) => e.playback.getIsPlaying());
	const [time, setTime] = useState(() => editor.playback.getCurrentTime());
	const total = useEditor((e) => e.timeline.getTotalDuration());
	useEffect(() => {
		const a = editor.playback.onUpdate(setTime);
		const b = editor.playback.onSeek(setTime);
		return () => {
			a();
			b();
		};
	}, [editor.playback]);
	const seek = (seconds: number) =>
		editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: Math.max(0, Math.min(total / TICKS_PER_SECOND, seconds)) }) });
	return (
		<div className="bg-panel flex items-center gap-4 rounded-md border px-4 py-2" data-studio-transport>
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-2xl tabular-nums">{formatDuration(time / TICKS_PER_SECOND)}</span>
				<span className="text-muted-foreground text-xs">{formatDuration(total / TICKS_PER_SECOND)} total</span>
			</div>
			<div className="mx-auto flex items-center gap-2">
				<Button size="icon" variant="outline" onClick={() => seek(0)} aria-label="To start">
					<SkipBack />
				</Button>
				<Button
					size="icon"
					className="size-11 rounded-full bg-gradient-to-br from-emerald-400 to-yellow-300 text-black"
					onClick={() => editor.playback.toggle()}
					aria-label={playing ? "Pause" : "Play"}
					data-studio-play
				>
					{playing ? <Pause /> : <Play />}
				</Button>
				<Button
					size="icon"
					variant="outline"
					onClick={() => {
						editor.playback.pause();
						seek(0);
					}}
					aria-label="Stop"
				>
					<Square />
				</Button>
				<Button size="icon" variant="outline" onClick={() => seek(total / TICKS_PER_SECOND)} aria-label="To end">
					<SkipForward />
				</Button>
			</div>
			<span className="text-muted-foreground text-xs">Edits here are on the video timeline too.</span>
		</div>
	);
}
