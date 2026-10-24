"use client";

import { Download, FolderOpen, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/library/components/page-shell";
import { QUALITY_PROFILES, type QualityProfile, bytesPerMinute } from "@/recording/preflight";
import { formatDuration } from "@/recording/session";
import { useRecordingSettings } from "@/recording/settings";
import { cn } from "@/utils/ui";
import { RECORDER_CHANNEL, type OpenRecordingMessage } from "../handoff";
import { type Take, useRecorderLibrary, useRecorderPrefs } from "../library";

const MODE_LABEL: Record<Take["mode"], string> = {
	screen: "Screen",
	"screen-camera": "Screen + camera",
	camera: "Camera",
	voiceover: "Voice",
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

/** Hands a saved take to the main window, which opens it in a new project. */
export async function openTakeInEditor(take: Take) {
	const tools = window.worksuite?.tools;
	if (!tools) throw new Error("Opening recordings needs the desktop app.");
	const file = new File([await tools.readSaved(take.path)], take.name, { type: "video/webm" });
	const channel = new BroadcastChannel(RECORDER_CHANNEL);
	channel.postMessage({ type: "open-recording", session: take.session, files: [{ role: "screen", label: "Screen", file }] } satisfies OpenRecordingMessage);
	channel.close();
	await window.worksuite?.recorder?.focusMain();
}

/** CT-R1: every take with thumbnail, length, mode and markers. */
export function RecordingsLibrary() {
	const { takes, remove } = useRecorderLibrary();
	const encoder = useRecorderPrefs((s) => s.encoder);
	const [query, setQuery] = useState("");
	const [missing, setMissing] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState<string | null>(null);

	// Takes whose file was moved or deleted outside the app.
	useEffect(() => {
		let cancelled = false;
		void Promise.all(takes.map(async (t) => ((await window.worksuite?.recorder?.exists(t.path)) === false ? t.id : null))).then((ids) => {
			if (!cancelled) setMissing(new Set(ids.filter((x): x is string => !!x)));
		});
		return () => {
			cancelled = true;
		};
	}, [takes]);

	const q = query.trim().toLowerCase();
	const shown = takes.filter((t) => !q || t.name.toLowerCase().includes(q));

	const quickExport = async (take: Take) => {
		const tools = window.worksuite?.tools;
		if (!tools) return;
		setBusy(take.id);
		try {
			const out = await tools.convert({ jobId: crypto.randomUUID(), input: take.path, options: { format: "mp4-h264", encoder, quality: 75, suffix: "export" } });
			toast.success(`Exported ${out.path.split(/[\\/]/).pop()}`);
			void window.worksuite?.files?.show(out.path);
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			setBusy(null);
		}
	};

	const remove2 = async (take: Take) => {
		await window.worksuite?.recorder?.deleteTake(take.path).catch(() => false);
		remove(take.id);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 p-3" data-recorder-library>
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
					<input className="w-full rounded-md border bg-transparent py-1.5 pr-3 pl-8 text-sm" placeholder="Search recordings" value={query} onChange={(e) => setQuery(e.target.value)} />
				</div>
				<span className="text-muted-foreground text-xs">
					{takes.length} recording{takes.length === 1 ? "" : "s"} · {formatBytes(takes.reduce((n, t) => n + t.bytes, 0))}
				</span>
			</div>
			{shown.length === 0 ? (
				<p className="text-muted-foreground py-12 text-center text-sm">{takes.length ? "Nothing matches." : "Your recordings show up here after you stop."}</p>
			) : (
				<ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
					{shown.map((take) => (
						<li key={take.id} className={cn("bg-card flex items-center gap-3 rounded-md border p-2", missing.has(take.id) && "opacity-50")} data-recorder-take>
							<div className="bg-muted relative h-[54px] w-24 shrink-0 overflow-hidden rounded">
								{take.thumbnail && (
									// eslint-disable-next-line @next/next/no-img-element -- local data URL
									<img src={take.thumbnail} alt="" className="size-full object-cover" />
								)}
								<span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{formatDuration(take.duration)}</span>
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{take.name}</div>
								<div className="text-muted-foreground truncate text-xs">
									{MODE_LABEL[take.mode]} · {formatBytes(take.bytes)} · {take.markers} marker{take.markers === 1 ? "" : "s"} · {new Date(take.createdAt).toLocaleString()}
									{missing.has(take.id) && " · file missing"}
								</div>
							</div>
							<Button
								size="sm"
								variant="outline"
								disabled={missing.has(take.id)}
								onClick={() => void openTakeInEditor(take).catch((e: unknown) => toast.error(errorText(e)))}
								data-take-edit
							>
								<Pencil /> Edit zooms
							</Button>
							<Button size="sm" variant="ghost" disabled={missing.has(take.id) || busy === take.id} onClick={() => void quickExport(take)} data-take-export>
								<Download /> {busy === take.id ? "Exporting…" : "Quick export"}
							</Button>
							<Button size="icon" variant="ghost" className="size-8" onClick={() => void window.worksuite?.files?.show(take.path)} aria-label="Show in folder">
								<FolderOpen />
							</Button>
							<Button size="icon" variant="ghost" className="size-8" onClick={() => void remove2(take)} aria-label="Delete" data-take-delete>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const SHORTCUT_LABELS: Record<keyof ReturnType<typeof useRecordingSettings.getState>["shortcuts"], string> = {
	toggle: "Start / stop",
	"toggle-pause": "Pause / resume",
	marker: "Add a marker",
};

const PROFILES: QualityProfile[] = ["standard", "high", "max"];
const SHORTCUT_KEYS = ["toggle", "toggle-pause", "marker"] as const;

/** CT-R2 to CT-R4: quality, encoder, folder and free space, shortcuts, privacy. */
export function RecorderSettings() {
	const settings = useRecordingSettings();
	const prefs = useRecorderPrefs();
	const [info, setInfo] = useState<{ folder: string; freeBytes: number | null } | null>(null);
	const [clashes, setClashes] = useState<string[]>([]);

	useEffect(() => {
		void window.worksuite?.recorder?.folderInfo(prefs.folder).then(setInfo).catch(() => setInfo(null));
	}, [prefs.folder]);

	// Register the shortcuts and say which ones another app already holds (CT-R3).
	useEffect(() => {
		void window.worksuite?.capture?.setShortcuts?.(settings.shortcuts).then((r) => setClashes(r.failed)).catch(() => {});
	}, [settings.shortcuts]);

	const perMinute = bytesPerMinute({ mode: "screen-camera", profile: settings.profile, channelCount: settings.channelCount });
	const hours = info?.freeBytes ? info.freeBytes / perMinute / 60 : null;

	return (
		<div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto p-4 text-sm" data-recorder-settings>
			<section className="flex flex-col gap-3">
				<h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Quality</h3>
				<div className="grid grid-cols-3 gap-1.5">
					{PROFILES.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => settings.set({ profile: p })}
							className={cn("rounded-md border px-2 py-2 text-xs", settings.profile === p ? "border-primary bg-primary/15 font-semibold" : "hover:bg-accent")}
							data-recorder-quality={p}
						>
							{QUALITY_PROFILES[p].label}
						</button>
					))}
				</div>
				<label className="flex items-center justify-between gap-2">
					Encoder for exports
					<select className="rounded border bg-transparent p-1" value={prefs.encoder} onChange={(e) => prefs.set({ encoder: e.target.value === "sw" ? "sw" : "auto" })}>
						<option value="auto">Hardware when available</option>
						<option value="sw">Software</option>
					</select>
				</label>
				<label className="flex items-center justify-between gap-2">
					Count-down
					<select className="rounded border bg-transparent p-1" value={settings.countdown} onChange={(e) => settings.set({ countdown: Number(e.target.value) })}>
						{[0, 3, 5].map((n) => (
							<option key={n} value={n}>
								{n ? `${n} s` : "Off"}
							</option>
						))}
					</select>
				</label>
				<h3 className="text-muted-foreground mt-2 text-xs font-semibold tracking-wider uppercase">Save to</h3>
				<div className="flex items-center gap-2">
					<span className="bg-muted/50 min-w-0 flex-1 truncate rounded px-2 py-1.5 font-mono text-xs" title={info?.folder}>
						{info?.folder ?? "Videos › Worksuite › Recordings"}
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void window.worksuite?.tools?.chooseFolder().then((f) => f && prefs.set({ folder: f }))}
					>
						Change
					</Button>
					{prefs.folder && (
						<Button size="sm" variant="ghost" onClick={() => prefs.set({ folder: null })}>
							Default
						</Button>
					)}
				</div>
				<p className="text-muted-foreground m-0 text-xs" data-recorder-space>
					{hours === null
						? "Free space unknown."
						: `${formatBytes(info?.freeBytes ?? 0)} free · about ${hours >= 10 ? Math.floor(hours) : hours.toFixed(1)} hours at ${QUALITY_PROFILES[settings.profile].label} with the camera.`}
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Shortcuts (work in any app)</h3>
				{SHORTCUT_KEYS.map((key) => (
					<label key={key} className="flex items-center justify-between gap-2">
						{SHORTCUT_LABELS[key]}
						<input
							className={cn("w-56 rounded border bg-transparent px-2 py-1 font-mono text-xs", clashes.includes(settings.shortcuts[key]) && "border-amber-500")}
							defaultValue={settings.shortcuts[key]}
							onBlur={(e) => settings.set({ shortcuts: { ...settings.shortcuts, [key]: e.target.value.trim() } })}
							data-recorder-shortcut={key}
						/>
					</label>
				))}
				{clashes.length > 0 && (
					<p className="m-0 text-xs text-amber-400" data-recorder-clash>
						{clashes.join(", ")} {clashes.length === 1 ? "is" : "are"} already used by another app or the system. Pick a different key.
					</p>
				)}
				<h3 className="text-muted-foreground mt-2 text-xs font-semibold tracking-wider uppercase">While recording</h3>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={settings.doNotDisturb} onChange={(e) => settings.set({ doNotDisturb: e.target.checked })} />
					Hold notifications back
				</label>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={settings.autoZoom} onChange={(e) => settings.set({ autoZoom: e.target.checked })} />
					Zoom in on clicks and typing in the editor
				</label>
				<label className="flex flex-col gap-1">
					Pause while these windows are open (private apps)
					<input
						className="rounded border bg-transparent px-2 py-1 text-xs"
						defaultValue={settings.protectedApps.join(", ")}
						onBlur={(e) => settings.set({ protectedApps: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40) })}
					/>
				</label>
			</section>
		</div>
	);
}
