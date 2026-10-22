"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Camera,
	Circle,
	Flag,
	Mic,
	Monitor,
	MonitorPlay,
	Pause,
	Play,
	RefreshCw,
	Square,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { CaptureSource } from "@/account/types";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";
import { placeRecording } from "../place";
import {
	bytesPerMinute,
	formatBytes,
	LOW_SPACE_MINUTES,
	minutesOfSpace,
	QUALITY_PROFILES,
	type QualityProfile,
	type RecordingMode,
} from "../preflight";
import { MediaAccessError, Recorder } from "../recorder";
import { formatDuration } from "../session";
import {
	assembleSession,
	deleteSessionData,
	type SessionManifest,
	useRecordingSessions,
} from "../storage";
import { useRecordingSettings } from "../settings";

const MODES: {
	value: RecordingMode;
	label: string;
	icon: typeof Mic;
	hint: string;
}[] = [
	{
		value: "voiceover",
		label: "Voiceover",
		icon: Mic,
		hint: "Record over the video, starting at the playhead",
	},
	{
		value: "screen",
		label: "Screen",
		icon: Monitor,
		hint: "A display or a window, with your mic",
	},
	{
		value: "screen-camera",
		label: "Screen + camera",
		icon: MonitorPlay,
		hint: "Camera as a picture-in-picture you can move later",
	},
	{
		value: "camera",
		label: "Camera",
		icon: Camera,
		hint: "Webcam and mic",
	},
];

const COUNTDOWNS = [0, 3, 5, 10];
const isMac =
	typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

type Phase = "idle" | "countdown" | "recording" | "saving";

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs">
			<span className="text-muted-foreground">{label}</span>
			{children}
		</label>
	);
}

const selectClass =
	"bg-background h-8 w-full min-w-0 rounded-md border px-2 text-xs";

function useDevices() {
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const refresh = useCallback(() => {
		navigator.mediaDevices
			?.enumerateDevices()
			.then(setDevices)
			.catch(() => setDevices([]));
	}, []);
	useEffect(() => {
		refresh();
		navigator.mediaDevices?.addEventListener("devicechange", refresh);
		return () =>
			navigator.mediaDevices?.removeEventListener("devicechange", refresh);
	}, [refresh]);
	return { devices, refresh };
}

function LevelMeter({ db }: { db: number }) {
	// −60 dB … 0 dB across the bar; red when clipping.
	const fill = Number.isFinite(db)
		? Math.max(0, Math.min(1, (db + 60) / 60))
		: 0;
	const clipping = db >= -0.5;
	return (
		<div
			className="bg-muted h-2 w-full overflow-hidden rounded-full"
			data-level-meter
			title={Number.isFinite(db) ? `${db.toFixed(1)} dB` : "Silence"}
		>
			<div
				className={cn(
					"h-full transition-[width] duration-75",
					clipping
						? "bg-red-500"
						: db > -12
							? "bg-amber-400"
							: "bg-emerald-500",
				)}
				style={{ width: `${fill * 100}%` }}
			/>
		</div>
	);
}

function StreamPreview({ stream }: { stream: MediaStream | null }) {
	const ref = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);
	if (!stream) return null;
	return (
		<video
			ref={ref}
			autoPlay
			muted
			playsInline
			className="aspect-video w-full rounded-lg bg-black object-contain"
		/>
	);
}

/** Recording sidebar: voiceover, screen, screen + camera, camera (AR, SC). */
export function RecordView() {
	const editor = useEditor();
	const project = useEditor((e) => e.project.getActiveOrNull());
	const projectId = project?.metadata.id ?? "";
	const settings = useRecordingSettings();
	const sessions = useRecordingSessions((s) => s.sessions);
	const { devices, refresh } = useDevices();
	const [sources, setSources] = useState<CaptureSource[]>([]);
	const [phase, setPhase] = useState<Phase>("idle");
	const [countdown, setCountdown] = useState(0);
	const [elapsed, setElapsed] = useState(0);
	const [paused, setPaused] = useState(false);
	const [level, setLevel] = useState(-Infinity);
	const [markers, setMarkers] = useState(0);
	const [space, setSpace] = useState<number | null>(null);
	const recorderRef = useRef<Recorder | null>(null);
	const [preview, setPreview] = useState<MediaStream | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);
	const wasMuted = useRef(false);
	const capture =
		typeof window !== "undefined" ? window.worksuite?.capture : undefined;

	const mode = settings.mode;
	const mics = devices.filter((d) => d.kind === "audioinput");
	const cameras = devices.filter((d) => d.kind === "videoinput");
	const needsScreen = mode === "screen" || mode === "screen-camera";
	const needsCamera = mode === "camera" || mode === "screen-camera";
	const perMinute = bytesPerMinute({
		mode,
		profile: settings.profile,
		channelCount: settings.channelCount,
	});
	const minutesLeft = minutesOfSpace({ availableBytes: space, perMinute });
	const unfinished = sessions.filter(
		(s) => s.projectId === projectId && s.id !== activeId,
	);

	const loadSources = useCallback(() => {
		window.worksuite?.capture
			?.sources()
			.catch(() => [])
			.then((list) => {
				setSources(list);
				const { sourceId, set } = useRecordingSettings.getState();
				if (!list.some((s) => s.id === sourceId)) {
					set({ sourceId: list[0]?.id ?? null });
				}
			});
	}, []);

	useEffect(() => {
		if (needsScreen) loadSources();
	}, [needsScreen, loadSources]);

	// Free space before and during recording (AR-13).
	useEffect(() => {
		let cancelled = false;
		const check = async () => {
			const estimate = await navigator.storage?.estimate?.().catch(() => null);
			if (cancelled || !estimate?.quota) return;
			setSpace(Math.max(0, estimate.quota - (estimate.usage ?? 0)));
		};
		void check();
		const timer = window.setInterval(check, 30_000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		if (phase !== "recording") return;
		const timer = window.setInterval(() => {
			setElapsed(recorderRef.current?.clock.elapsed() ?? 0);
		}, 200);
		return () => window.clearInterval(timer);
	}, [phase]);

	useEffect(() => {
		if (
			phase === "recording" &&
			minutesLeft !== null &&
			minutesLeft < LOW_SPACE_MINUTES
		) {
			toast.warning(
				`About ${Math.floor(minutesLeft)} minutes of space left for recording`,
				{ id: "recording-space" },
			);
		}
	}, [phase, minutesLeft]);

	const releasePlayback = () => {
		if (mode !== "voiceover") return;
		editor.playback.pause();
		if (!wasMuted.current) editor.playback.unmute();
	};

	const reset = () => {
		recorderRef.current = null;
		setActiveId(null);
		setPreview(null);
		setPhase("idle");
		setElapsed(0);
		setPaused(false);
		setMarkers(0);
		setLevel(-Infinity);
	};

	const start = async () => {
		if (!project) return;
		let recorder: Recorder;
		try {
			recorder = await Recorder.open({
				mode,
				projectId,
				timelineStart: editor.playback.getCurrentTime() / TICKS_PER_SECOND,
				profile: settings.profile,
				micId: settings.micId,
				cameraId: settings.cameraId,
				sourceId: settings.sourceId,
				systemAudio: needsScreen && settings.systemAudio && !isMac,
				channelCount: settings.channelCount,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Couldn't start recording";
			toast.error(message, {
				description:
					error instanceof MediaAccessError
						? isMac
							? `Open System Settings → Privacy & Security → ${error.device === "screen" ? "Screen Recording" : error.device === "camera" ? "Camera" : "Microphone"} and turn on Worksuite FrameFlow.`
							: `Allow ${error.device} access for desktop apps in your system privacy settings, then try again.`
						: undefined,
			});
			return;
		}
		recorderRef.current = recorder;
		setActiveId(recorder.id);
		refresh();
		recorder.onLevel(setLevel);
		recorder.onDeviceEnded((role) => {
			setPaused(true);
			toast.warning(
				role === "screen"
					? "Screen sharing stopped. The take is paused."
					: `Your ${role === "mic" ? "microphone" : "camera"} disconnected. The take is paused.`,
			);
		});
		setPreview(recorder.camera ?? recorder.screen);
		setPhase("countdown");
		for (let n = settings.countdown; n > 0; n--) {
			setCountdown(n);
			await new Promise((r) => setTimeout(r, 1000));
			if (recorderRef.current !== recorder) return;
		}
		if (mode === "voiceover") {
			wasMuted.current = editor.playback.isMuted();
			if (settings.muteTimeline) editor.playback.mute();
			editor.playback.play();
		}
		recorder.start();
		setPhase("recording");
	};

	const togglePause = () => {
		const recorder = recorderRef.current;
		if (!recorder?.isRecording) return;
		if (recorder.clock.paused) {
			recorder.resume();
			if (mode === "voiceover") editor.playback.play();
			setPaused(false);
		} else {
			recorder.pause();
			if (mode === "voiceover") editor.playback.pause();
			setPaused(true);
		}
	};

	const marker = () => {
		if (recorderRef.current?.addMarker() !== null) setMarkers((n) => n + 1);
	};

	const finish = async ({
		session,
		recover,
	}: {
		session: SessionManifest;
		recover: () => Promise<Awaited<ReturnType<typeof assembleSession>>>;
	}) => {
		const files = await recover();
		if (files.length === 0) {
			toast.error("Nothing was recorded");
			await deleteSessionData(session.id);
			return;
		}
		const placed = await placeRecording({ editor, session, files });
		await deleteSessionData(session.id);
		toast.success(
			`Added ${placed} recorded track${placed === 1 ? "" : "s"} to the timeline`,
		);
	};

	const stop = async () => {
		const recorder = recorderRef.current;
		if (!recorder) return;
		if (!recorder.isRecording) {
			recorder.release();
			reset();
			return;
		}
		setPhase("saving");
		releasePlayback();
		try {
			const { session, files } = await recorder.stop();
			await finish({ session, recover: async () => files });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't save the recording",
			);
		} finally {
			reset();
		}
	};

	const discard = async () => {
		const recorder = recorderRef.current;
		if (!recorder) return;
		const id = recorder.id;
		recorder.release();
		releasePlayback();
		reset();
		await deleteSessionData(id);
		toast("Take discarded");
	};

	// Shortcuts while recording: Esc discards (AR-07), M adds a marker, P pauses.
	useEffect(() => {
		if (phase !== "recording" && phase !== "countdown") return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				void discard();
			} else if (phase === "recording" && event.key.toLowerCase() === "m") {
				event.preventDefault();
				event.stopPropagation();
				marker();
			} else if (phase === "recording" && event.key.toLowerCase() === "p") {
				event.preventDefault();
				event.stopPropagation();
				togglePause();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});

	// Leaving the panel mid-take keeps the chunks so the take can be recovered.
	useEffect(() => () => recorderRef.current?.release(), []);

	if (!project) return null;

	if (phase !== "idle") {
		return (
			<PanelView title="Recording">
				<div className="flex flex-col gap-3" data-recording-active>
					<StreamPreview stream={preview} />
					{phase === "countdown" ? (
						<div className="flex flex-col items-center gap-2 py-6">
							<span className="text-6xl font-bold tabular-nums" data-countdown>
								{countdown}
							</span>
							<span className="text-muted-foreground text-xs">
								Esc to cancel
							</span>
						</div>
					) : (
						<div className="flex items-center justify-between">
							<span className="flex items-center gap-2 text-sm font-semibold">
								<Circle
									className={cn(
										"size-3 fill-red-500 text-red-500",
										!paused && "animate-pulse",
									)}
								/>
								{paused ? "Paused" : "Recording"}
							</span>
							<span
								className="font-mono text-lg tabular-nums"
								data-recording-time
							>
								{formatDuration(elapsed)}
							</span>
						</div>
					)}
					<div className="flex flex-col gap-1">
						<LevelMeter db={level} />
						{level >= -0.5 && (
							<span className="text-[11px] text-red-400">
								Too loud — move back from the mic or lower its gain
							</span>
						)}
					</div>
					{phase === "recording" && (
						<div className="grid grid-cols-2 gap-2">
							<Button variant="outline" onClick={togglePause}>
								{paused ? <Play /> : <Pause />}
								{paused ? "Resume" : "Pause"}
							</Button>
							<Button variant="outline" onClick={marker} data-add-marker>
								<Flag /> Marker{markers > 0 ? ` (${markers})` : ""}
							</Button>
							<Button
								className="bg-red-600 text-white hover:bg-red-700"
								onClick={() => void stop()}
								data-stop-recording
							>
								<Square className="fill-current" /> Stop
							</Button>
							<Button variant="text" onClick={() => void discard()}>
								<Trash2 /> Discard
							</Button>
						</div>
					)}
					{phase === "saving" && (
						<p className="text-muted-foreground text-center text-xs">
							Saving the take…
						</p>
					)}
					{phase === "recording" && (
						<p className="text-muted-foreground m-0 text-[11px]">
							M adds a marker · P pauses · Esc discards. Saved every second, so
							a crash loses almost nothing.
						</p>
					)}
				</div>
			</PanelView>
		);
	}

	return (
		<PanelView title="Record">
			<div className="flex flex-col gap-4" data-record-view>
				{unfinished.map((session) => (
					<div
						key={session.id}
						className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
						data-recovery
					>
						<span>
							An unfinished{" "}
							{session.mode === "voiceover" ? "voiceover" : "recording"} from{" "}
							{new Date(session.startedAt).toLocaleString()} can be recovered.
						</span>
						<div className="flex gap-2">
							<Button
								size="sm"
								onClick={() =>
									void finish({
										session,
										recover: () => assembleSession(session),
									})
								}
							>
								<RefreshCw /> Recover
							</Button>
							<Button
								size="sm"
								variant="text"
								onClick={() => void deleteSessionData(session.id)}
							>
								Discard
							</Button>
						</div>
					</div>
				))}

				<div className="grid grid-cols-2 gap-2">
					{MODES.map((m) => (
						<button
							key={m.value}
							type="button"
							data-record-mode={m.value}
							title={m.hint}
							onClick={() => settings.set({ mode: m.value })}
							className={cn(
								"flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors",
								mode === m.value
									? "border-[#22D3EE] bg-[#22D3EE]/10"
									: "hover:bg-accent/40",
							)}
						>
							<m.icon className="size-5" />
							{m.label}
						</button>
					))}
				</div>
				<p className="text-muted-foreground m-0 text-xs">
					{MODES.find((m) => m.value === mode)?.hint}
				</p>

				{needsScreen && capture && (
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
								What to record
							</span>
							<button
								type="button"
								className="text-muted-foreground hover:text-foreground"
								aria-label="Refresh screens and windows"
								onClick={() => loadSources()}
							>
								<RefreshCw className="size-3.5" />
							</button>
						</div>
						<div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
							{sources.map((source) => (
								<button
									key={source.id}
									type="button"
									data-capture-source={source.kind}
									onClick={() => settings.set({ sourceId: source.id })}
									className={cn(
										"flex flex-col gap-1 rounded-lg border p-1 text-left text-[11px]",
										settings.sourceId === source.id
											? "border-[#22D3EE] ring-1 ring-[#22D3EE]"
											: "hover:bg-accent/40",
									)}
								>
									{source.thumbnail ? (
										// eslint-disable-next-line @next/next/no-img-element -- local data URL
										<img
											src={source.thumbnail}
											alt=""
											className="aspect-video w-full rounded bg-black object-contain"
										/>
									) : (
										<span className="bg-muted aspect-video w-full rounded" />
									)}
									<span className="truncate">{source.name}</span>
								</button>
							))}
						</div>
					</div>
				)}

				<div className="flex flex-col gap-2">
					<Field label="Microphone">
						<select
							className={selectClass}
							value={settings.micId ?? ""}
							onChange={(e) => settings.set({ micId: e.target.value || null })}
						>
							<option value="">System default</option>
							{mics.map((d, i) => (
								<option key={d.deviceId || i} value={d.deviceId}>
									{d.label || `Microphone ${i + 1}`}
								</option>
							))}
						</select>
					</Field>
					<Field label="Channels">
						<select
							className={selectClass}
							value={settings.channelCount}
							onChange={(e) =>
								settings.set({ channelCount: e.target.value === "2" ? 2 : 1 })
							}
						>
							<option value={1}>Mono · 48 kHz</option>
							<option value={2}>Stereo · 48 kHz</option>
						</select>
					</Field>
					{needsCamera && (
						<Field label="Camera">
							<select
								className={selectClass}
								value={settings.cameraId ?? ""}
								onChange={(e) =>
									settings.set({ cameraId: e.target.value || null })
								}
							>
								<option value="">System default</option>
								{cameras.map((d, i) => (
									<option key={d.deviceId || i} value={d.deviceId}>
										{d.label || `Camera ${i + 1}`}
									</option>
								))}
							</select>
						</Field>
					)}
					{needsScreen && (
						<Field label="Quality">
							<select
								className={selectClass}
								value={settings.profile}
								onChange={(e) => {
									const value = e.target.value;
									if (
										value === "standard" ||
										value === "high" ||
										value === "max"
									) {
										settings.set({ profile: value satisfies QualityProfile });
									}
								}}
							>
								{Object.entries(QUALITY_PROFILES).map(([key, p]) => (
									<option key={key} value={key}>
										{p.label}
									</option>
								))}
							</select>
						</Field>
					)}
					<Field label="Countdown">
						<div className="flex gap-1">
							{COUNTDOWNS.map((n) => (
								<button
									key={n}
									type="button"
									onClick={() => settings.set({ countdown: n })}
									className={cn(
										"h-7 flex-1 rounded-md border text-xs",
										settings.countdown === n
											? "bg-primary text-primary-foreground border-primary"
											: "hover:bg-accent",
									)}
								>
									{n === 0 ? "Off" : `${n}s`}
								</button>
							))}
						</div>
					</Field>
					{mode === "voiceover" && (
						<label className="flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={settings.muteTimeline}
								onChange={(e) =>
									settings.set({ muteTimeline: e.target.checked })
								}
							/>
							Mute the timeline while recording (use headphones to hear it
							without echo)
						</label>
					)}
					{needsScreen && !isMac && (
						<label className="flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={settings.systemAudio}
								onChange={(e) =>
									settings.set({ systemAudio: e.target.checked })
								}
							/>
							Record system audio (its own track)
						</label>
					)}
				</div>

				<div
					className={cn(
						"rounded-lg border px-3 py-2 text-[11px]",
						minutesLeft !== null && minutesLeft < LOW_SPACE_MINUTES
							? "border-amber-500/50 text-amber-300"
							: "text-muted-foreground",
					)}
					data-preflight
				>
					About {formatBytes(perMinute)} per minute
					{minutesLeft !== null &&
						` · room for ${
							minutesLeft >= 600
								? "10+ hours"
								: `${Math.floor(minutesLeft)} minutes`
						}`}
				</div>

				<Button
					className="bg-red-600 text-white hover:bg-red-700"
					onClick={() => void start()}
					disabled={needsScreen && !!capture && !settings.sourceId}
					data-start-recording
				>
					<Circle className="fill-current" />
					{mode === "voiceover" ? "Record voiceover" : "Start recording"}
				</Button>
			</div>
		</PanelView>
	);
}
