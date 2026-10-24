"use client";

import { Mic, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { formatDuration } from "@/recording/session";
import { cn } from "@/utils/ui";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import { audioBufferToWav } from "@/export/master";
import { importAudio } from "../actions";

interface Take {
	id: string;
	blob: Blob;
	url: string;
	seconds: number;
	/** Where on the timeline the take was recorded from. */
	at: MediaTime;
}

/** Level advice for the input meter (AE-08). */
function advice(db: number): { text: string; tone: string } {
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
	const [level, setLevel] = useState(-90);
	const [script, setScript] = useState("");
	const [speed, setSpeed] = useState(30);
	const [playVideo, setPlayVideo] = useState(true);
	const [countIn, setCountIn] = useState(3);
	const [count, setCount] = useState<number | null>(null);
	const [recording, setRecording] = useState<number | null>(null);
	const [takes, setTakes] = useState<Take[]>([]);
	const stream = useRef<MediaStream | null>(null);
	const recorder = useRef<MediaRecorder | null>(null);
	const prompter = useRef<HTMLDivElement>(null);

	// Open the chosen mic for the meter while the dialog is open.
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
				const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
				setMics(devices);
				ctx = new AudioContext();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 2048;
				ctx.createMediaStreamSource(s).connect(analyser);
				const buf = new Float32Array(analyser.fftSize);
				let held = -90;
				const tick = () => {
					raf = requestAnimationFrame(tick);
					analyser.getFloatTimeDomainData(buf);
					let peak = 0;
					for (const v of buf) peak = Math.max(peak, Math.abs(v));
					held = Math.max(peak > 0 ? 20 * Math.log10(peak) : -90, held - 0.6);
					setLevel(held);
				};
				tick();
			} catch {
				toast.error("Couldn't open the microphone. Check the app's mic permission.");
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
		if (recording === null) return;
		let raf = 0;
		let last = performance.now();
		const step = (now: number) => {
			raf = requestAnimationFrame(step);
			if (prompter.current) prompter.current.scrollTop += ((now - last) / 1000) * speed;
			last = now;
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [recording, speed]);

	const start = async () => {
		const s = stream.current;
		if (!s) return toast.error("No microphone.");
		if (prompter.current) prompter.current.scrollTop = 0;
		for (let n = countIn; n > 0; n--) {
			setCount(n);
			await new Promise((r) => setTimeout(r, 1000));
		}
		setCount(null);
		const at = editor.playback.getCurrentTime();
		const chunks: Blob[] = [];
		const rec = new MediaRecorder(s, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "" });
		rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
		const began = performance.now();
		rec.onstop = () => {
			const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
			setTakes((t) => [...t, { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), seconds: (performance.now() - began) / 1000, at }]);
		};
		recorder.current = rec;
		rec.start(250);
		setRecording(performance.now());
		if (playVideo) editor.playback.play();
	};

	const stop = () => {
		recorder.current?.stop();
		recorder.current = null;
		setRecording(null);
		editor.playback.pause();
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

	const tip = advice(level);
	const pct = Math.max(0, Math.min(100, ((level + 60) / 60) * 100));
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		if (recording === null) return;
		const id = setInterval(() => setElapsed((performance.now() - recording) / 1000), 200);
		return () => clearInterval(id);
	}, [recording]);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o && recording !== null) stop();
				onOpenChange(o);
			}}
		>
			<DialogContent className="max-w-2xl" data-studio-voiceover>
				<DialogHeader>
					<DialogTitle>Record voice-over</DialogTitle>
				</DialogHeader>
				<div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4 p-4 text-sm">
					<div className="flex min-w-0 flex-col gap-2">
						<div className="relative">
							<div
								ref={prompter}
								className={cn(
									"bg-muted/40 h-48 overflow-y-auto rounded-md border p-4 text-xl leading-relaxed whitespace-pre-wrap",
									recording === null && "hidden",
								)}
								data-teleprompter
							>
								{script || "No script. Just talk."}
								<div className="h-48" />
							</div>
							{recording === null && (
								<textarea
									className="h-48 w-full resize-none rounded-md border bg-transparent p-3 text-base"
									placeholder="Paste your script for the teleprompter (Sinhala, Tamil or English)"
									value={script}
									onChange={(e) => setScript(e.target.value)}
									data-voiceover-script
								/>
							)}
							{count !== null && (
								<div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60 text-6xl font-bold">{count}</div>
							)}
						</div>
						<div className="flex items-center gap-2 text-xs">
							<span className="text-muted-foreground">Scroll speed</span>
							<input type="range" min={5} max={120} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1" />
						</div>
						<div className="flex items-center gap-2">
							{recording === null ? (
								<Button className="bg-red-600 text-white hover:bg-red-500" onClick={() => void start()} disabled={count !== null} data-voiceover-record>
									<Mic /> {count !== null ? "Get ready…" : "Record"}
								</Button>
							) : (
								<Button variant="destructive" onClick={stop} data-voiceover-stop>
									<Square /> Stop · {formatDuration(elapsed)}
								</Button>
							)}
							<span className="text-muted-foreground text-xs">
								Starts at {formatDuration(editor.playback.getCurrentTime() / TICKS_PER_SECOND)} on the timeline
							</span>
						</div>
					</div>
					<div className="flex flex-col gap-3 text-xs">
						<label className="flex flex-col gap-1">
							Microphone
							<select className="rounded border bg-transparent p-1.5" value={micId} onChange={(e) => setMicId(e.target.value)}>
								<option value="">Default</option>
								{mics.map((m) => (
									<option key={m.deviceId} value={m.deviceId}>
										{m.label || "Microphone"}
									</option>
								))}
							</select>
						</label>
						<div className="flex flex-col gap-1">
							<div className="bg-muted h-2.5 overflow-hidden rounded-full">
								<div className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-[width]" style={{ width: `${pct}%` }} />
							</div>
							<span className={tip.tone} data-voiceover-advice>
								{tip.text}
							</span>
						</div>
						<label className="flex items-center gap-2">
							<input type="checkbox" checked={playVideo} onChange={(e) => setPlayVideo(e.target.checked)} /> Play the video while recording
						</label>
						<label className="flex items-center gap-2">
							Count-in
							<select className="rounded border bg-transparent p-1" value={countIn} onChange={(e) => setCountIn(Number(e.target.value))}>
								{[0, 3, 5].map((n) => (
									<option key={n} value={n}>
										{n ? `${n} s` : "Off"}
									</option>
								))}
							</select>
						</label>
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground font-semibold tracking-wider uppercase">Takes</span>
							{takes.length === 0 && <span className="text-muted-foreground">None yet.</span>}
							{takes.map((take, i) => (
								<div key={take.id} className="bg-accent/40 flex items-center gap-1 rounded p-1.5" data-voiceover-take>
									<span className="flex-1">
										Take {i + 1} · {formatDuration(take.seconds)}
									</span>
									<button type="button" title="Listen" onClick={() => void new Audio(take.url).play()}>
										<Play className="size-3.5" />
									</button>
									<button type="button" title="Add to the timeline" onClick={() => void use({ take, index: i })} data-voiceover-use>
										<Plus className="size-3.5" />
									</button>
									<button
										type="button"
										title="Delete"
										onClick={() => {
											URL.revokeObjectURL(take.url);
											setTakes(takes.filter((t) => t.id !== take.id));
										}}
									>
										<Trash2 className="size-3.5" />
									</button>
								</div>
							))}
							{takes.length > 0 && (
								<Button size="sm" variant="outline" onClick={() => void use({ take: takes[takes.length - 1]!, index: takes.length - 1 })}>
									Use last take
								</Button>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

