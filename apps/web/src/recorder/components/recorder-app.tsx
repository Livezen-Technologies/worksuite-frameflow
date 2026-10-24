"use client";

import { AppWindow, ChevronDown, Crop, Mic, MicOff, Monitor, Pause, Play, Square, Trash2, Video, VideoOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { CaptureSource } from "@/account/types";
import type { CaptureArea } from "@/recording/area";
import { AreaPicker } from "@/recording/components/area-picker";
import type { RecordingMode } from "@/recording/preflight";
import { Recorder, type RecordingResult } from "@/recording/recorder";
import { formatDuration } from "@/recording/session";
import { useRecordingSettings } from "@/recording/settings";
import { deleteSessionData } from "@/recording/storage";
import { cn } from "@/utils/ui";
import { findProtected } from "@/recording/privacy";
import { RECORDER_CHANNEL, type OpenRecordingMessage } from "../handoff";
import { type Take, thumbnailOf, useRecorderLibrary, useRecorderPrefs } from "../library";
import { RecorderSettings, RecordingsLibrary } from "./recorder-panels";

type Phase = "setup" | "countdown" | "recording" | "stopping" | "done";
type TargetMode = "screen" | "window" | "area";
type AccessKind = "screen" | "microphone" | "camera";
const ACCESS_LABEL: Record<AccessKind, { title: string; why: string }> = {
	screen: { title: "Screen Recording", why: "to record your screen. After you turn it on, macOS asks you to quit and reopen FrameFlow." },
	microphone: { title: "Microphone", why: "to record your voice." },
	camera: { title: "Camera", why: "to record your camera." },
};
type View = "record" | "library" | "settings";
const VIEW_HEIGHT: Record<View, number> = { record: 290, library: 620, settings: 600 };

function modeFor({ screen, camera }: { screen: boolean; camera: boolean }): RecordingMode {
	if (screen && camera) return "screen-camera";
	if (screen) return "screen";
	if (camera) return "camera";
	return "voiceover";
}

const noSubscribe = () => () => {};

/** Devices and screens exist only in the window, so nothing renders on the server. */
export function RecorderApp() {
	const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
	return mounted ? <RecorderWindow /> : <div className="bg-background min-h-screen" />;
}

/**
 * The standalone recorder (Camtasia-style): screen or region, camera,
 * microphone and system audio, each with an on/off switch, and a big Rec
 * button. After Stop it asks whether to save the video or open it to edit.
 */
function RecorderWindow() {
	const settings = useRecordingSettings();
	const [screenOn, setScreenOn] = useState(true);
	const [cameraOn, setCameraOn] = useState(settings.mode === "screen-camera" || settings.mode === "camera");
	const [micOn, setMicOn] = useState(true);
	const [regionOpen, setRegionOpen] = useState(false);
	const [sources, setSources] = useState<CaptureSource[]>([]);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [phase, setPhase] = useState<Phase>("setup");
	const [count, setCount] = useState(0);
	const [missing, setMissing] = useState<AccessKind[]>([]);
	const [accessOpen, setAccessOpen] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [paused, setPaused] = useState(false);
	const [level, setLevel] = useState(-90);
	const [result, setResult] = useState<RecordingResult | null>(null);
	const recorder = useRef<Recorder | null>(null);
	const [view, setView] = useState<View>("record");
	const [take, setTake] = useState<Take | null>(null);
	const prefs = useRecorderPrefs();
	const folder = prefs.folder;
	const cameraPreview = useRef<HTMLVideoElement>(null);
	const desktop = !!window.worksuite?.capture;

	const source = sources.find((s) => s.id === settings.sourceId) ?? sources.find((s) => s.kind === "screen") ?? null;
	const screens = sources.filter((s) => s.kind === "screen");
	const windows = sources.filter((s) => s.kind === "window");
	const savedMode: TargetMode = source?.kind === "window" ? "window" : settings.area ? "area" : "screen";
	const [modeChoice, setModeChoice] = useState<TargetMode | null>(null);
	const targetMode = modeChoice ?? savedMode;
	const refreshSources = () => void window.worksuite?.capture?.sources().then(setSources).catch(() => {});
	const openTarget = () => {
		setModeChoice(null);
		refreshSources();
		setRegionOpen(true);
	};
	const pickMode = (mode: TargetMode) => {
		setModeChoice(mode);
		if (mode === "window") {
			if (source?.kind !== "window" && windows[0]) settings.set({ sourceId: windows[0].id, area: null });
		} else {
			const screen = source?.kind === "screen" ? source : screens[0];
			settings.set({ sourceId: screen?.id ?? null, area: mode === "area" ? (settings.area ?? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }) : null });
		}
	};
	const cameras = devices.filter((d) => d.kind === "videoinput");
	const mics = devices.filter((d) => d.kind === "audioinput");

	useEffect(() => {
		document.title = "FrameFlow Recorder";
		void window.worksuite?.capture?.sources().then(setSources).catch(() => {});
		const load = () => void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
		load();
		navigator.mediaDevices?.addEventListener("devicechange", load);
		return () => navigator.mediaDevices?.removeEventListener("devicechange", load);
	}, []);

	// Live camera picture and mic level before recording starts.
	useEffect(() => {
		if (phase !== "setup") return;
		let stopped = false;
		const streams: MediaStream[] = [];
		let raf = 0;
		let context: AudioContext | null = null;
		void (async () => {
			try {
				if (cameraOn) {
					const stream = await navigator.mediaDevices.getUserMedia({
						video: settings.cameraId ? { deviceId: { exact: settings.cameraId } } : true,
					});
					if (stopped) return stream.getTracks().forEach((t) => t.stop());
					streams.push(stream);
					if (cameraPreview.current) cameraPreview.current.srcObject = stream;
				}
				if (micOn) {
					const stream = await navigator.mediaDevices.getUserMedia({
						audio: settings.micId ? { deviceId: { exact: settings.micId } } : true,
					});
					if (stopped) return stream.getTracks().forEach((t) => t.stop());
					streams.push(stream);
					context = new AudioContext();
					const analyser = context.createAnalyser();
					analyser.fftSize = 1024;
					context.createMediaStreamSource(stream).connect(analyser);
					const buffer = new Float32Array(analyser.fftSize);
					const tick = () => {
						analyser.getFloatTimeDomainData(buffer);
						let peak = 0;
						for (const v of buffer) peak = Math.max(peak, Math.abs(v));
						setLevel(peak > 0 ? 20 * Math.log10(peak) : -90);
						raf = requestAnimationFrame(tick);
					};
					tick();
				}
				// Labels appear once a device was allowed.
				setDevices(await navigator.mediaDevices.enumerateDevices());
			} catch {
				// Shown on the tile; the user can pick another device.
			}
		})();
		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			void context?.close().catch(() => {});
			for (const stream of streams) for (const track of stream.getTracks()) track.stop();
			setLevel(-90);
		};
	}, [phase, cameraOn, micOn, settings.cameraId, settings.micId]);

	useEffect(() => {
		if (phase !== "recording") return;
		const timer = window.setInterval(() => setElapsed(recorder.current?.clock.elapsed() ?? 0), 250);
		return () => window.clearInterval(timer);
	}, [phase]);

	// Dialogs open inside this window, so it grows while one is up; at the
	// Record tab's 290 px the window picker would be cut off.
	const dialogOpen = regionOpen || accessOpen || (phase === "done" && !!result);
	useEffect(() => {
		const height = regionOpen ? 680 : dialogOpen ? 460 : VIEW_HEIGHT[view];
		void window.worksuite?.recorder?.setSize({ width: regionOpen ? 1000 : 900, height });
	}, [view, dialogOpen, regionOpen]);

	// Hold notifications back and pause for private windows during a take (CT-R4).
	useEffect(() => {
		if (phase !== "recording") return;
		const capture = window.worksuite?.capture;
		if (settings.doNotDisturb) void capture?.doNotDisturb?.(true);
		let autoPaused = false;
		const timer = window.setInterval(async () => {
			const active = recorder.current;
			if (!active || !capture?.windowNames || !screenOn || prefs.privateMode !== "pause") return;
			const hit = findProtected({ windows: await capture.windowNames(), patterns: settings.protectedApps });
			if (hit && !active.clock.paused) {
				active.pause();
				autoPaused = true;
				setPaused(true);
				toast.info(`Paused: ${hit} is open`);
			} else if (!hit && autoPaused && active.clock.paused) {
				active.resume();
				autoPaused = false;
				setPaused(false);
			}
		}, 2000);
		return () => {
			window.clearInterval(timer);
			if (settings.doNotDisturb) void capture?.doNotDisturb?.(false);
		};
	}, [phase, settings.doNotDisturb, settings.protectedApps, screenOn, prefs.privateMode]);

	const canRecord = screenOn || cameraOn || micOn;

	/** macOS privacy settings the current choices need but don't have yet. */
	const checkAccess = async (): Promise<AccessKind[]> => {
		const capture = window.worksuite?.capture;
		if (!capture?.permissions) return [];
		const status = await capture.permissions().catch(() => null);
		if (!status) return [];
		const wanted: AccessKind[] = [...(screenOn ? ["screen" as const] : []), ...(micOn ? ["microphone" as const] : []), ...(cameraOn ? ["camera" as const] : [])];
		const missing: AccessKind[] = [];
		for (const kind of wanted) {
			if (status[kind] === "granted") continue;
			// Mic and camera can be asked for in place; screen recording only in System Settings.
			if (status[kind] === "not-determined" && kind !== "screen" && (await capture.requestPermission?.(kind))) continue;
			missing.push(kind);
		}
		setMissing(missing);
		return missing;
	};

	// Always re-check: on open, when choices change, and when coming back from System Settings.
	useEffect(() => {
		if (phase !== "setup") return;
		const again = () => void checkAccess();
		const first = window.setTimeout(again, 0);
		window.addEventListener("focus", again);
		return () => {
			window.clearTimeout(first);
			window.removeEventListener("focus", again);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase, screenOn, micOn, cameraOn]);

	useEffect(() => {
		if (phase === "recording") void window.worksuite?.capture?.framePaused?.(paused);
		void window.worksuite?.capture?.indicator?.(phase === "recording" ? (paused ? "paused" : "recording") : "off");
	}, [phase, paused]);

	const begin = async () => {
		if (!canRecord) return;
		if ((await checkAccess()).length) {
			setAccessOpen(true);
			return;
		}
		setPhase("countdown");
		const capture = window.worksuite?.capture;
		try {
			if (screenOn && source?.kind !== "window") await capture?.frameShow?.({ sourceId: source?.id ?? null, area: settings.area ?? null }).catch(() => null);
			const opened = await Recorder.open({
				mode: modeFor({ screen: screenOn, camera: cameraOn }),
				projectId: "recorder",
				timelineStart: 0,
				area: screenOn ? settings.area : null,
				profile: settings.profile,
				micId: settings.micId,
				cameraId: settings.cameraId,
				sourceId: source?.id ?? null,
				systemAudio: screenOn && settings.systemAudio,
				channelCount: settings.channelCount,
				micOff: !micOn,
				singleFile: true,
			});
			opened.onLevel(setLevel);
			recorder.current = opened;
			// Drawn on screen so it's in the video: clicks, keys, private-window covers (CT-R4).
			if (screenOn && (prefs.highlightClicks || prefs.showKeys || settings.cursorHalo || prefs.privateMode === "cover")) {
				await window.worksuite?.capture
					?.overlayStart?.({
						sourceId: source?.id ?? null,
						keys: prefs.showKeys,
						clicks: prefs.highlightClicks,
						halo: settings.cursorHalo,
						clickColor: settings.clickColor,
						clickSize: settings.clickSize,
						privatePatterns: prefs.privateMode === "cover" ? settings.protectedApps : [],
					})
					.catch(() => null);
			}
			for (let n = Math.max(0, settings.countdown); n > 0; n--) {
				setCount(n);
				void capture?.frameCount?.(n);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			setCount(0);
			void capture?.frameCount?.(0);
			opened.start();
			setPaused(false);
			setElapsed(0);
			setPhase("recording");
		} catch (error) {
			recorder.current?.release();
			recorder.current = null;
			void window.worksuite?.capture?.overlayStop?.();
			void window.worksuite?.capture?.frameHide?.();
			setPhase("setup");
			toast.error(error instanceof Error ? error.message : "Couldn't start recording");
		}
	};

	const stop = async () => {
		const active = recorder.current;
		if (!active) return;
		setPhase("stopping");
		void window.worksuite?.capture?.overlayStop?.();
		void window.worksuite?.capture?.frameHide?.();
		try {
			const finished = await active.stop();
			setResult(finished);
			setPhase("done");
			setTake(await keepInLibrary(finished));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't finish the recording");
			setPhase("setup");
		} finally {
			recorder.current = null;
		}
	};

	/** Every finished take is saved to the recordings folder and listed in the library (CT-R1). */
	const keepInLibrary = async (finished: RecordingResult): Promise<Take | null> => {
		const bridge = window.worksuite?.recorder;
		const main = finished.files.find((f) => f.role === "screen") ?? finished.files.find((f) => f.role === "camera") ?? finished.files[0];
		if (!bridge || !main) return null;
		try {
			const saved = await bridge.saveTake({ fileName: main.file.name, data: await main.file.arrayBuffer(), folder });
			const entry: Take = {
				id: finished.session.id,
				path: saved.path,
				name: saved.path.split(/[\\/]/).pop() ?? main.file.name,
				bytes: main.file.size,
				duration: finished.session.duration,
				mode: finished.session.mode,
				markers: finished.session.markers.length,
				thumbnail: await thumbnailOf(main.file),
				createdAt: finished.session.startedAt,
				session: finished.session,
			};
			useRecorderLibrary.getState().add(entry);
			return entry;
		} catch (error) {
			toast.error(`Couldn't save the take to the library: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	};

	const discard = () => {
		void window.worksuite?.capture?.overlayStop?.();
		void window.worksuite?.capture?.frameHide?.();
		const active = recorder.current;
		if (active) {
			const id = active.id;
			active.release();
			void deleteSessionData(id);
		}
		recorder.current = null;
		setPhase("setup");
	};

	const togglePause = () => {
		const active = recorder.current;
		if (!active) return;
		if (active.clock.paused) active.resume();
		else active.pause();
		setPaused(active.clock.paused);
		void window.worksuite?.capture?.overlayPause?.(active.clock.paused);
	};

	const finish = (keep: boolean) => {
		if (result && !keep) void deleteSessionData(result.session.id);
		setTake(null);
		setResult(null);
		setPhase("setup");
	};

	const save = async () => {
		if (!result) return;
		const bridge = window.worksuite?.files;
		let saved = 0;
		for (const { file, role } of result.files) {
			const name = role === "camera" ? file.name.replace(/\.webm$/, " (camera).webm") : file.name;
			if (bridge) {
				const outcome = await bridge.saveExport({ suggestedName: name, data: await file.arrayBuffer() });
				if (outcome.saved) saved++;
				else break;
			} else {
				const url = URL.createObjectURL(file);
				const a = document.createElement("a");
				a.href = url;
				a.download = name;
				a.click();
				setTimeout(() => URL.revokeObjectURL(url), 10_000);
				saved++;
			}
		}
		if (saved > 0) {
			toast.success(saved === 1 ? "Video saved" : `${saved} videos saved`);
			finish(false);
		}
	};

	const openInEditor = () => {
		if (!result) return;
		const channel = new BroadcastChannel(RECORDER_CHANNEL);
		channel.postMessage({ type: "open-recording", session: result.session, files: result.files } satisfies OpenRecordingMessage);
		channel.close();
		void window.worksuite?.recorder?.focusMain();
		// The editor deletes the take's chunks once it's on the timeline.
		finish(true);
	};

	// Global shortcuts and the floating bar (CT-R3) drive this window while it's open.
	const handlers = useRef({ begin, stop, togglePause, discard, phase });
	useEffect(() => {
		handlers.current = { begin, stop, togglePause, discard, phase };
	});
	useEffect(
		() =>
			window.worksuite?.capture?.onCommand?.((command) => {
				const h = handlers.current;
				if (command === "toggle") {
					if (h.phase === "setup") void h.begin();
					else if (h.phase === "recording") void h.stop();
				} else if (command === "stop" && h.phase === "recording") void h.stop();
				else if (command === "toggle-pause" && h.phase === "recording") h.togglePause();
				else if (command === "discard" && h.phase === "recording") h.discard();
				else if (command === "marker" && h.phase === "recording") {
					const at = recorder.current?.addMarker();
					if (at != null) toast.success(`Marker at ${formatDuration(at)}`);
				}
			}),
		[],
	);

	const busy = phase !== "setup";
	const areaPx = settings.area
		? {
				w: Math.round(settings.area.width * window.screen.width * window.devicePixelRatio),
				h: Math.round(settings.area.height * window.screen.height * window.devicePixelRatio),
			}
		: null;

	return (
		<div className="bg-background text-foreground flex h-screen select-none flex-col" data-recorder>
			<div className="flex shrink-0 items-center gap-1 border-b px-3 py-1">
				{(
					[
						["record", "Record"],
						["library", "Library"],
						["settings", "Settings"],
					] as const
				).map(([id, label]) => (
					<button
						key={id}
						type="button"
						disabled={busy && id !== "record"}
						onClick={() => setView(id)}
						className={cn("rounded px-2.5 py-0.5 text-xs", view === id ? "bg-secondary font-semibold" : "text-muted-foreground hover:text-foreground disabled:opacity-40")}
						data-recorder-view={id}
					>
						{label}
					</button>
				))}
				<span className="text-muted-foreground ml-auto text-[11px]">
					{settings.shortcuts.toggle} to start or stop
				</span>
			</div>
			{view === "record" && missing.length > 0 && phase === "setup" && (
				<button
					type="button"
					data-recorder-access-warning
					onClick={() => setAccessOpen(true)}
					className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-left text-xs text-amber-500"
				>
					macOS hasn&apos;t allowed {missing.map((k) => ACCESS_LABEL[k].title).join(", ")} yet. Click to set it up.
				</button>
			)}
			{view === "library" && <RecordingsLibrary />}
			{view === "settings" && <RecorderSettings />}
			<div className={cn("flex min-h-0 flex-1 items-stretch gap-3 p-3", view !== "record" && "hidden")}>
				<Tile
					on={screenOn}
					onToggle={setScreenOn}
					disabled={busy}
					label={savedMode === "window" ? "Window" : savedMode === "area" ? "Custom area" : "Full screen"}
					testId="screen"
					menu={
						<select
							className="w-full min-w-0 appearance-none truncate bg-transparent pr-4 text-xs outline-none"
							value={source?.id ?? ""}
							disabled={busy || !desktop}
							onChange={(e) => settings.set({ sourceId: e.target.value || null })}
							aria-label="Screen or window"
						>
							{!desktop && <option value="">Choose when recording starts</option>}
							{sources.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					}
				>
					<button
						type="button"
						className="relative size-full overflow-hidden rounded bg-[#1d6f8a]"
						onClick={openTarget}
						disabled={busy || !screenOn}
						title="Choose a screen, a window or an area"
						data-recorder-region
					>
						{source?.thumbnail && (
							// eslint-disable-next-line @next/next/no-img-element -- local data URL
							<img src={source.thumbnail} alt="" className="absolute inset-0 size-full object-cover opacity-60" />
						)}
						{settings.area && (
							<span
								className="absolute border-2 border-dashed border-white/90"
								style={{
									left: `${settings.area.x * 100}%`,
									top: `${settings.area.y * 100}%`,
									width: `${settings.area.width * 100}%`,
									height: `${settings.area.height * 100}%`,
								}}
							/>
						)}
						<span className="absolute inset-x-2 bottom-2 flex justify-between gap-2 font-mono text-[11px]">
							{savedMode === "window" ? (
								<span className="truncate rounded bg-black/60 px-1.5 py-0.5">{source?.name}</span>
							) : (
								<>
									<span className="rounded bg-black/60 px-1.5 py-0.5">↔ {areaPx?.w ?? "Full"}</span>
									<span className="rounded bg-black/60 px-1.5 py-0.5">↕ {areaPx?.h ?? "screen"}</span>
								</>
							)}
						</span>
						{!screenOn && <Monitor className="text-muted-foreground absolute inset-0 m-auto size-8" />}
					</button>
				</Tile>

				<Tile
					on={cameraOn}
					onToggle={setCameraOn}
					disabled={busy}
					label="Camera"
					testId="camera"
					menu={
						<DeviceSelect
							devices={cameras}
							value={settings.cameraId}
							disabled={busy}
							onChange={(id) => settings.set({ cameraId: id })}
							fallback="Default camera"
						/>
					}
				>
					<div className="relative size-full overflow-hidden rounded bg-black">
						{cameraOn ? (
							<video ref={cameraPreview} autoPlay muted playsInline className="size-full object-cover" />
						) : (
							<VideoOff className="text-muted-foreground absolute inset-0 m-auto size-8" />
						)}
						{cameraOn && <Video className="absolute top-1.5 right-1.5 size-3.5 text-white/80" />}
					</div>
				</Tile>

				<Tile
					on={micOn}
					onToggle={setMicOn}
					disabled={busy}
					label="Microphone"
					testId="mic"
					menu={
						<DeviceSelect
							devices={mics}
							value={settings.micId}
							disabled={busy}
							onChange={(id) => settings.set({ micId: id })}
							fallback="Default microphone"
						/>
					}
				>
					<div className="flex size-full items-center gap-3 px-2">
						{micOn ? <Mic className="text-muted-foreground size-6 shrink-0" /> : <MicOff className="text-muted-foreground size-6 shrink-0" />}
						<div className="flex flex-1 flex-col gap-2">
							<div className="bg-muted h-3 overflow-hidden rounded-sm" data-recorder-level>
								<div
									className={cn("h-full transition-[width] duration-75", level > -6 ? "bg-red-500" : level > -18 ? "bg-yellow-400" : "bg-green-500")}
									style={{ width: `${micOn ? Math.max(0, Math.min(100, ((level + 60) / 60) * 100)) : 0}%` }}
								/>
							</div>
							<span className="text-muted-foreground text-[11px]">{micOn ? "Speak to test the level" : "Off"}</span>
						</div>
					</div>
				</Tile>

				<Tile
					on={settings.systemAudio}
					onToggle={(on) => settings.set({ systemAudio: on })}
					disabled={busy || !screenOn}
					label="System audio"
					testId="system"
				>
					<div className="flex size-full items-center justify-center">
						{settings.systemAudio && screenOn ? (
							<Volume2 className="size-8" />
						) : (
							<VolumeX className="text-muted-foreground size-8" />
						)}
					</div>
				</Tile>

				<div className="flex w-36 shrink-0 flex-col items-center justify-center gap-2">
					{phase === "recording" || phase === "stopping" ? (
						<>
							<span className="font-mono text-2xl tabular-nums" data-recorder-time>
								{formatDuration(elapsed)}
							</span>
							<div className="flex gap-1.5">
								<Button size="icon" variant="outline" onClick={togglePause} title={paused ? "Resume" : "Pause"} disabled={phase !== "recording"}>
									{paused ? <Play className="size-4" /> : <Pause className="size-4" />}
								</Button>
								<Button size="icon" className="bg-red-600 text-white hover:bg-red-500" onClick={() => void stop()} title="Stop" disabled={phase !== "recording"} data-recorder-stop>
									<Square className="size-4 fill-current" />
								</Button>
								<Button size="icon" variant="ghost" onClick={discard} title="Discard" disabled={phase !== "recording"}>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</>
					) : (
						<>
							<button
								type="button"
								onClick={() => void begin()}
								disabled={!canRecord || phase !== "setup"}
								className="flex size-20 items-center justify-center rounded-full bg-red-600 text-xl font-semibold text-white shadow-lg transition hover:bg-red-500 disabled:opacity-50"
								data-recorder-rec
							>
								{phase === "countdown" ? count || "…" : "rec"}
							</button>
							<span className="text-muted-foreground text-xs">{canRecord ? "Start" : "Turn something on"}</span>
						</>
					)}
				</div>
			</div>

			<Dialog open={accessOpen} onOpenChange={setAccessOpen}>
				<DialogContent className="max-w-md" data-recorder-access>
					<DialogHeader>
						<DialogTitle>Allow FrameFlow to record</DialogTitle>
						<DialogDescription>
							Open System Settings → Privacy &amp; Security, turn on FrameFlow in each list below, then come back and press Start.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						{missing.length === 0 ? (
							<p className="text-sm text-emerald-500">Everything&apos;s allowed. You can start recording.</p>
						) : (
							missing.map((kind) => (
								<div key={kind} className="flex items-center justify-between gap-3 border p-3">
									<div className="text-sm">
										<div className="font-medium">{ACCESS_LABEL[kind].title}</div>
										<div className="text-muted-foreground text-xs">Needed {ACCESS_LABEL[kind].why}</div>
									</div>
									<Button size="sm" variant="outline" onClick={() => void window.worksuite?.capture?.openPermissionSettings?.(kind)}>
										Open Settings
									</Button>
								</div>
							))
						)}
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setAccessOpen(false)}>
							Close
						</Button>
						<Button
							onClick={async () => {
								if (!(await checkAccess()).length) {
									setAccessOpen(false);
									void begin();
								}
							}}
						>
							{missing.length ? "Check again" : "Start recording"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={regionOpen} onOpenChange={setRegionOpen}>
				<DialogContent className="max-w-2xl" data-recorder-target>
					<DialogHeader>
						<DialogTitle>What to record</DialogTitle>
						<DialogDescription>Record a whole screen, one window, or an area you drag.</DialogDescription>
					</DialogHeader>
					<div className="bg-muted/40 grid grid-cols-3 gap-1 p-1">
						{(
							[
								["screen", "Full screen", Monitor],
								["window", "Window", AppWindow],
								["area", "Custom area", Crop],
							] as const
						).map(([id, label, Icon]) => (
							<button
								key={id}
								type="button"
								data-target-mode={id}
								onClick={() => pickMode(id)}
								className={cn(
									"flex items-center justify-center gap-2 py-2 text-sm",
									targetMode === id ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
								)}
							>
								<Icon className="size-4" />
								{label}
							</button>
						))}
					</div>
					{targetMode === "area" ? (
						<div className="flex flex-col gap-2">
							{screens.length > 1 && (
								<SourceGrid sources={screens} selected={source?.id ?? null} onPick={(id) => settings.set({ sourceId: id })} compact />
							)}
							<AreaPicker
								thumbnail={source?.thumbnail ?? null}
								area={settings.area}
								onChange={(area: CaptureArea | null) => settings.set({ area })}
							/>
						</div>
					) : (
						<SourceGrid
							sources={targetMode === "window" ? windows : screens}
							selected={source?.id ?? null}
							onPick={(id) => settings.set({ sourceId: id, area: null })}
							empty={targetMode === "window" ? "No windows to record. Open the app you want to record, then press Refresh." : "No screens found."}
						/>
					)}
					<DialogFooter className="gap-2 sm:justify-between">
						<Button variant="ghost" onClick={refreshSources}>
							Refresh
						</Button>
						<Button onClick={() => setRegionOpen(false)} disabled={targetMode === "area" && !settings.area}>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={phase === "done" && !!result} onOpenChange={(open) => !open && finish(true)}>
				<DialogContent className="max-w-md" data-recorder-done>
					<DialogHeader>
						<DialogTitle>Recording finished</DialogTitle>
						<DialogDescription>
							{formatDuration(result?.session.duration ?? 0)} recorded{take ? " and kept in your Library" : ""}. Save a copy, or
							open it in the editor to cut, add text and export.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 sm:justify-between">
						<Button
							variant="ghost"
							onClick={() => {
								if (take) {
									void window.worksuite?.recorder?.deleteTake(take.path);
									useRecorderLibrary.getState().remove(take.id);
								}
								finish(false);
							}}
							data-recorder-discard
						>
							Discard
						</Button>
						<div className="flex gap-2">
							<Button variant="outline" onClick={() => void save()} data-recorder-save>
								Save video…
							</Button>
							<Button onClick={openInEditor} data-recorder-edit>
								Open in editor
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function Tile({
	on,
	onToggle,
	disabled,
	label,
	menu,
	testId,
	children,
}: {
	on: boolean;
	onToggle: (on: boolean) => void;
	disabled?: boolean;
	label: string;
	menu?: React.ReactNode;
	testId: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("bg-card flex min-w-0 flex-1 flex-col rounded-md border", !on && "opacity-70")} data-recorder-tile={testId}>
			<div className="min-h-0 flex-1 p-2">{children}</div>
			<div className="flex flex-col gap-1 border-t px-2 py-1.5">
				<div className="flex items-center gap-2">
					<Switch checked={on} onCheckedChange={onToggle} disabled={disabled} aria-label={label} />
					<span className="truncate text-sm font-medium">{label}</span>
				</div>
				{menu && (
					<label className="text-muted-foreground hover:text-foreground relative flex min-w-0 items-center">
						{menu}
						<ChevronDown className="pointer-events-none absolute right-0 size-3" />
					</label>
				)}
			</div>
		</div>
	);
}

function DeviceSelect({
	devices,
	value,
	disabled,
	onChange,
	fallback,
}: {
	devices: MediaDeviceInfo[];
	value: string | null;
	disabled?: boolean;
	onChange: (id: string | null) => void;
	fallback: string;
}) {
	return (
		<select
			className="w-full min-w-0 appearance-none truncate bg-transparent pr-4 text-xs outline-none"
			value={value ?? ""}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value || null)}
		>
			<option value="">{fallback}</option>
			{devices.map((d, i) => (
				<option key={d.deviceId || i} value={d.deviceId}>
					{d.label || `${fallback} ${i + 1}`}
				</option>
			))}
		</select>
	);
}

/** Screen or window cards with live thumbnails. */
function SourceGrid({
	sources,
	selected,
	onPick,
	compact = false,
	empty,
}: {
	sources: CaptureSource[];
	selected: string | null;
	onPick: (id: string) => void;
	compact?: boolean;
	empty?: string;
}) {
	if (!sources.length) return <p className="text-muted-foreground py-10 text-center text-sm">{empty}</p>;
	return (
		<div className={cn("grid max-h-[50vh] gap-3 overflow-y-auto p-0.5", compact ? "grid-cols-4" : "grid-cols-3")}>
			{sources.map((s) => (
				<button
					key={s.id}
					type="button"
					data-source-card={s.id}
					onClick={() => onPick(s.id)}
					className={cn(
						"flex flex-col gap-1.5 border p-1.5 text-left transition-colors",
						selected === s.id ? "border-primary ring-primary bg-primary/10 ring-1" : "hover:bg-muted/50",
					)}
				>
					<div className="relative aspect-video overflow-hidden bg-black">
						{s.thumbnail ? (
							// eslint-disable-next-line @next/next/no-img-element -- local data URL
							<img src={s.thumbnail} alt="" className="size-full object-contain" />
						) : (
							<Monitor className="text-muted-foreground absolute inset-0 m-auto size-6" />
						)}
					</div>
					<span className="truncate text-xs">{s.name}</span>
				</button>
			))}
		</div>
	);
}
