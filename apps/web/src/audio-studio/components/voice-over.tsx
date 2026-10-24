"use client";

import { Mic, MicOff, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { audioBufferToWav } from "@/export/master";
import { formatDuration } from "@/recording/session";
import { cn } from "@/utils/ui";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import { importAudio } from "../actions";

interface Take {
	id: string;
	blob: Blob;
	url: string;
	seconds: number;
	/** Where on the timeline the take was recorded from. */
	at: MediaTime;
}

type Phase = "idle" | "countdown" | "recording";

const METER_BARS = 24;
const SPEEDS = [
	["Slow", 18],
	["Normal", 32],
	["Fast", 55],
] as const;

/** Level advice for the input meter (AE-08). */
function advice(db: number): { text: string; tone: string } {
	if (db <= -89) return { text: "No signal: check the microphone", tone: "text-muted-foreground" };
	if (db < -45) return { text: "Too quiet: move closer or raise the mic gain", tone: "text-amber-400" };
	if (db > -6) return { text: "Too loud: it may clip, lower the gain", tone: "text-red-400" };
	return { text: "Good level", tone: "text-emerald-400" };
}

/**
 * Record voice-over (AE-08): mic picker, input meter with advice, a
 * teleprompter that scrolls while you talk, the video playing along,
 * a count-in, and a list of takes to keep.
 */
export function VoiceOverDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const editor = useEditor();
	const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
	const [micId, setMicId] = useState("");
	const [micError, setMicError] = useState<string | null>(null);
	const [tip, setTip] = useState(advice(-90));
	const [script, setScript] = useState("");
	const [speed, setSpeed] = useState(32);
	const [playVideo, setPlayVideo] = useState(true);
	const [countIn, setCountIn] = useState(3);
	const [count, setCount] = useState(0);
	const [phase, setPhase] = useState<Phase>("idle");
	const [startedAt, setStartedAt] = useState(0);
	const [elapsed, setElapsed] = useState(0);
	const [takes, setTakes] = useState<Take[]>([]);
	const [playing, setPlaying] = useState<string | null>(null);
	const stream = useRef<MediaStream | null>(null);
	const recorder = useRef<MediaRecorder | null>(null);
	const prompter = useRef<HTMLDivElement>(null);
	const meter = useRef<HTMLDivElement>(null);
	const audio = useRef<HTMLAudioElement | null>(null);
	/** Bumped to cancel a count-in in progress (closing the dialog, pressing Stop). */
	const run = useRef(0);
	const busy = phase !== "idle";

	// Open the chosen mic for the meter while the dialog is open. The meter
	// draws straight into the DOM, so the dialog doesn't re-render 60×/s.
	useEffect(() => {
		if (!open) return;
		let raf = 0;
		let ctx: AudioContext | null = null;
		let cancelled = false;
		void (async () => {
			try {
				const s = await navigator.mediaDevices.getUserMedia({
					audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
				});
				if (cancelled) return s.getTracks().forEach((t) => t.stop());
				stream.current = s;
				setMicError(null);
				setMics((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
				ctx = new AudioContext();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 2048;
				ctx.createMediaStreamSource(s).connect(analyser);
				const buf = new Float32Array(analyser.fftSize);
				let held = -90;
				let lastTip = 0;
				const tick = (now: number) => {
					raf = requestAnimationFrame(tick);
					analyser.getFloatTimeDomainData(buf);
					let peak = 0;
					for (const v of buf) peak = Math.max(peak, Math.abs(v));
					held = Math.max(peak > 0 ? 20 * Math.log10(peak) : -90, held - 0.6);
					const lit = Math.round(Math.max(0, Math.min(1, (held + 60) / 60)) * METER_BARS);
					meter.current?.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar, i) => {
						bar.dataset.on = String(i < lit);
					});
					if (now - lastTip > 250) {
						lastTip = now;
						const next = advice(held);
						setTip((t) => (t.text === next.text ? t : next));
					}
				};
				raf = requestAnimationFrame(tick);
			} catch {
				stream.current = null;
				setMicError("Couldn't open the microphone. Allow microphone access for FrameFlow in your system settings, or pick another mic.");
			}
		})();
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			void ctx?.close();
			stream.current?.getTracks().forEach((t) => t.stop());
			stream.current = null;
		};
	}, [open, micId]);

	// Teleprompter scroll while recording.
	useEffect(() => {
		if (phase !== "recording") return;
		let raf = 0;
		let last = performance.now();
		const step = (now: number) => {
			raf = requestAnimationFrame(step);
			if (prompter.current) prompter.current.scrollTop += ((now - last) / 1000) * speed;
			last = now;
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [phase, speed]);

	useEffect(() => {
		if (phase !== "recording") return;
		const id = setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 200);
		return () => clearInterval(id);
	}, [phase, startedAt]);

	const start = async () => {
		const s = stream.current;
		if (!s) return toast.error(micError ?? "No microphone.");
		const token = ++run.current;
		setElapsed(0);
		if (prompter.current) prompter.current.scrollTop = 0;
		setPhase("countdown");
		for (let n = countIn; n > 0; n--) {
			setCount(n);
			await new Promise((r) => setTimeout(r, 1000));
			if (run.current !== token) return;
		}
		const at = editor.playback.getCurrentTime();
		const chunks: Blob[] = [];
		const rec = new MediaRecorder(s, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : {});
		rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
		const began = performance.now();
		rec.onstop = () => {
			const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
			if (blob.size) setTakes((t) => [...t, { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), seconds: (performance.now() - began) / 1000, at }]);
		};
		recorder.current = rec;
		rec.start(250);
		setStartedAt(began);
		setPhase("recording");
		if (playVideo) editor.playback.play();
	};

	const stop = () => {
		run.current++;
		if (recorder.current?.state === "recording") recorder.current.stop();
		recorder.current = null;
		setPhase("idle");
		editor.playback.pause();
	};

	const listen = (take: Take) => {
		audio.current?.pause();
		if (playing === take.id) return setPlaying(null);
		const a = new Audio(take.url);
		a.onended = () => setPlaying(null);
		audio.current = a;
		setPlaying(take.id);
		void a.play();
	};

	const use = async ({ take, index }: { take: Take; index: number }) => {
		editor.playback.seek({ time: take.at });
		try {
			// Recorded WebM has no duration in its header; store the take as WAV.
			const ctx = new AudioContext();
			const decoded = await ctx.decodeAudioData(await take.blob.arrayBuffer());
			void ctx.close();
			const file = new File([audioBufferToWav(decoded)], `Voice-over take ${index + 1}.wav`, { type: "audio/wav" });
			await importAudio({ editor, files: [file] });
			toast.success(`Take ${index + 1} added at ${formatDuration(take.at / TICKS_PER_SECOND)}`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		}
	};

	const remove = (take: Take) => {
		if (playing === take.id) audio.current?.pause();
		URL.revokeObjectURL(take.url);
		setTakes((list) => list.filter((t) => t.id !== take.id));
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					if (busy) stop();
					audio.current?.pause();
				}
				onOpenChange(o);
			}}
		>
			<DialogContent className="w-[min(960px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden p-0" data-studio-voiceover>
				<DialogHeader className="border-b px-6 py-4">
					<DialogTitle className="flex items-center gap-2">
						<Mic className="size-5 text-red-500" /> Record voice-over
					</DialogTitle>
					<DialogDescription>Read from the teleprompter while the video plays. Every take is kept until you add it.</DialogDescription>
				</DialogHeader>
				<div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
					{/* Teleprompter and transport */}
					<div className="flex min-w-0 flex-col gap-4 p-6">
						<div className="relative overflow-hidden rounded-xl border bg-black/40">
							{busy ? (
								<>
									<div ref={prompter} className="h-72 overflow-y-auto px-8 py-24 text-center text-3xl leading-relaxed font-medium whitespace-pre-wrap [scrollbar-width:none]" data-teleprompter>
										{script || "No script. Just talk."}
										<div className="h-72" />
									</div>
									{/* Reading line and soft fades top and bottom. */}
									<div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 to-transparent" />
									<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
									<div className="pointer-events-none absolute inset-x-4 top-1/2 h-px bg-red-500/40" />
								</>
							) : (
								<textarea
									className="placeholder:text-muted-foreground block h-72 w-full resize-none bg-transparent p-5 text-lg leading-relaxed outline-none"
									placeholder={"Paste or type your script here.\nSinhala, Tamil and English all work."}
									value={script}
									onChange={(e) => setScript(e.target.value)}
									data-voiceover-script
								/>
							)}
							{phase === "countdown" && (
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm">
									<span key={count} className="animate-in zoom-in-50 fade-in text-8xl font-bold tabular-nums duration-300">
										{count}
									</span>
									<span className="text-muted-foreground text-sm">Get ready…</span>
								</div>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<span className="text-muted-foreground text-xs font-medium">Scroll</span>
							<div className="bg-muted/60 flex rounded-lg p-0.5" role="group" aria-label="Scroll speed">
								{SPEEDS.map(([label, value]) => (
									<button
										key={label}
										type="button"
										onClick={() => setSpeed(value)}
										aria-pressed={speed === value}
										className={cn("rounded-md px-3 py-1 text-xs font-medium transition", speed === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
									>
										{label}
									</button>
								))}
							</div>
							<input type="range" aria-label="Scroll speed" min={5} max={120} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="accent-primary min-w-24 flex-1" />
						</div>
						<div className="bg-muted/30 flex items-center gap-4 rounded-xl border px-4 py-3">
							<button
								type="button"
								onClick={() => (busy ? stop() : void start())}
								disabled={!busy && !!micError}
								aria-label={busy ? "Stop" : "Record"}
								className={cn(
									"flex size-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition focus-visible:ring-4 focus-visible:ring-red-500/40 focus-visible:outline-none disabled:opacity-40",
									busy ? "bg-neutral-700 hover:bg-neutral-600" : "bg-red-600 hover:scale-105 hover:bg-red-500",
								)}
								data-voiceover-record={busy ? undefined : true}
								data-voiceover-stop={busy ? true : undefined}
							>
								{busy ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
							</button>
							<div className="flex min-w-0 flex-col">
								<span className="flex items-center gap-2 font-mono text-2xl tabular-nums">
									{phase === "recording" && <span className="size-2.5 animate-pulse rounded-full bg-red-500" />}
									{formatDuration(elapsed)}
								</span>
								<span className="text-muted-foreground truncate text-xs">
									{phase === "recording"
										? "Recording… press Stop when you're done"
										: phase === "countdown"
											? "Starting…"
											: `Starts at ${formatDuration(editor.playback.getCurrentTime() / TICKS_PER_SECOND)} on the timeline`}
								</span>
							</div>
						</div>
					</div>

					{/* Input, options, takes */}
					<aside className="bg-muted/20 flex min-w-0 flex-col gap-5 border-t p-6 md:border-t-0 md:border-l">
						<section className="flex flex-col gap-2">
							<h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Input</h3>
							<select
								className="bg-background w-full truncate rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
								value={micId}
								onChange={(e) => setMicId(e.target.value)}
								disabled={busy}
								aria-label="Microphone"
							>
								<option value="">System default</option>
								{mics
									.filter((m) => m.deviceId && m.deviceId !== "default")
									.map((m) => (
										<option key={m.deviceId} value={m.deviceId}>
											{m.label || "Microphone"}
										</option>
									))}
							</select>
							<div ref={meter} className="flex h-5 items-end gap-[3px]" aria-hidden>
								{Array.from({ length: METER_BARS }, (_, i) => (
									<span
										key={i}
										data-bar
										data-on="false"
										className={cn(
											"h-full flex-1 rounded-[2px] bg-white/10 transition-colors duration-75",
											i < METER_BARS * 0.65 ? "data-[on=true]:bg-emerald-500" : i < METER_BARS * 0.88 ? "data-[on=true]:bg-amber-400" : "data-[on=true]:bg-red-500",
										)}
									/>
								))}
							</div>
							{micError ? (
								<p className="m-0 flex items-start gap-1.5 text-xs text-red-400">
									<MicOff className="mt-0.5 size-3.5 shrink-0" />
									{micError}
								</p>
							) : (
								<span className={cn("text-xs", tip.tone)} data-voiceover-advice>
									{tip.text}
								</span>
							)}
						</section>
						<section className="flex flex-col gap-3">
							<h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Options</h3>
							<div className="flex items-center justify-between gap-3 text-sm">
								<span id="vo-play-video">Play the video while recording</span>
								<Switch checked={playVideo} onCheckedChange={setPlayVideo} disabled={busy} aria-labelledby="vo-play-video" />
							</div>
							<div className="flex items-center justify-between gap-3 text-sm">
								Count-in
								<div className="bg-muted/60 flex rounded-lg p-0.5" role="group" aria-label="Count-in">
									{[0, 3, 5].map((n) => (
										<button
											key={n}
											type="button"
											disabled={busy}
											onClick={() => setCountIn(n)}
											aria-pressed={countIn === n}
											className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition", countIn === n ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
										>
											{n ? `${n} s` : "Off"}
										</button>
									))}
								</div>
							</div>
						</section>
						<section className="flex min-h-0 flex-1 flex-col gap-2">
							<h3 className="text-muted-foreground flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase">
								Takes <span className="tabular-nums">{takes.length || ""}</span>
							</h3>
							{takes.length === 0 ? (
								<p className="text-muted-foreground m-0 rounded-lg border border-dashed px-3 py-4 text-center text-xs">Your takes show up here.</p>
							) : (
								<ul className="m-0 flex max-h-56 list-none flex-col gap-1.5 overflow-y-auto p-0">
									{takes.map((take, i) => (
										<li key={take.id} className="bg-background/60 flex items-center gap-2 rounded-lg border px-2 py-1.5" data-voiceover-take>
											<Button size="icon" variant="ghost" className="size-7" onClick={() => listen(take)} aria-label={playing === take.id ? "Pause" : "Listen"}>
												{playing === take.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
											</Button>
											<div className="min-w-0 flex-1 text-xs">
												<div className="font-medium">Take {i + 1}</div>
												<div className="text-muted-foreground tabular-nums">
													{formatDuration(take.seconds)} · at {formatDuration(take.at / TICKS_PER_SECOND)}
												</div>
											</div>
											<Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-xs" onClick={() => void use({ take, index: i })} data-voiceover-use>
												<Plus className="size-3.5" /> Add
											</Button>
											<Button size="icon" variant="ghost" className="text-muted-foreground size-7 hover:text-red-400" onClick={() => remove(take)} aria-label="Delete take">
												<Trash2 className="size-3.5" />
											</Button>
										</li>
									))}
								</ul>
							)}
						</section>
					</aside>
				</div>
			</DialogContent>
		</Dialog>
	);
}
