"use client";

import { Ban, Check, Download, FolderOpen, Link2, Pause, Pencil, Play, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { LinkInfo } from "@/account/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useEditor } from "@/editor/use-editor";
import { formatBytes, LibraryPageShell } from "@/library/components/page-shell";
import { formatDuration } from "@/recording/session";
import { cn } from "@/utils/ui";
import { cancelItem, type DownloadItem, pauseItem, pumpQueue, resumeItem, useDownloads } from "../download-store";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type { TranscriptionLanguage } from "@/transcription/types";
import { openSavedInEditor } from "../open-in-editor";

type Tab = "add" | "queue" | "library";
type Checked = { link: string; state: "checking" | "ready"; info?: LinkInfo; selected: boolean };

const LINK = /https?:\/\/[^\s"'<>]+/g;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

const TRANSCRIBE_LANGUAGES = [
	["si", "Sinhala"],
	["ta", "Tamil"],
	["en", "English"],
	["auto", "Detect"],
] as const;
const languageOf = (code: string | null): TranscriptionLanguage | null => TRANSCRIPTION_LANGUAGES.find((l) => l.code === code)?.code ?? (code === "auto" ? "auto" : null);

/** "1:30" or "90" → seconds. */
function parseTime(text: string): number | undefined {
	const t = text.trim();
	if (!t) return undefined;
	const parts = t.split(":").map(Number);
	if (parts.some((n) => !Number.isFinite(n))) return undefined;
	return parts.reduce((total, n) => total * 60 + n, 0);
}

/**
 * Tools › Video downloader (SRS 37.4, screens 26–28): paste links, check
 * each one, choose options with a rights tick, then a queue with pause and
 * resume, and a library of everything downloaded. Direct links and
 * HLS/DASH without DRM only.
 */
export function VideoDownloader() {
	const tools = window.worksuite?.tools;
	const editor = useEditor();
	const router = useRouter();
	const [tab, setTab] = useState<Tab>("add");
	const items = useDownloads((s) => s.items);
	const running = items.filter((i) => i.status === "downloading" || i.status === "queued" || i.status === "processing" || i.status === "paused").length;

	// Keep the queue moving whenever something is queued.
	const queued = items.filter((i) => i.status === "queued").length;
	const unmeteredOnly = useDownloads((s) => s.unmeteredOnly);
	useEffect(() => {
		if (!queued) return;
		pumpQueue({
			onFinished: (item) => {
				toast.success(`Downloaded ${item.title}`);
				const after = item.afterDownload ?? "none";
				if ((after === "library" || after === "timeline") && item.path) {
					// The editor window adds it to the open project.
					void tools?.sendToEditor?.({ path: item.path, mode: after, track: item.track ?? "auto" }).then((sent) => {
						if (!sent) toast.info("Open a project in FrameFlow to add the download to it.");
					});
				} else if ((item.openWhenDone || item.transcribe) && item.path) {
					void openSavedInEditor({ editor, filePath: item.path, push: router.push, transcribe: languageOf(item.transcribe) }).catch((e: unknown) =>
						toast.error(errorText(e)),
					);
				}
			},
		});
	}, [queued, unmeteredOnly, editor, router]);

	return (
		<LibraryPageShell
			back={!inOwnWindow()}
			title="Video downloader"
			subtitle="Save videos and audio from direct links and streams without DRM. Only download what you have the rights to use."
			actions={
				<nav className="bg-accent/60 flex rounded-lg p-1 text-sm" aria-label="Downloader">
					{(
						[
							["add", "Add links"],
							["queue", `Queue${running ? ` (${running})` : ""}`],
							["library", "Library"],
						] as const
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							onClick={() => setTab(id)}
							aria-pressed={tab === id}
							className={cn("rounded-md px-3 py-1", tab === id ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}
							data-downloader-tab={id}
						>
							{label}
						</button>
					))}
				</nav>
			}
		>
			{!tools ? (
				<p className="text-muted-foreground">The downloader is part of the desktop app.</p>
			) : tab === "add" ? (
				<AddLinks onQueued={() => setTab("queue")} />
			) : tab === "queue" ? (
				<Queue />
			) : (
				<Library />
			)}
		</LibraryPageShell>
	);
}

function AddLinks({ onQueued }: { onQueued: () => void }) {
	const tools = window.worksuite?.tools;
	const [text, setText] = useState("");
	const [checked, setChecked] = useState<Checked[]>([]);
	const [options, setOptions] = useState(false);

	const check = async (input: string) => {
		const links = [...new Set(input.match(LINK) ?? [])];
		if (!links.length) return toast.info("Paste one or more links, one per line.");
		const fresh = links.filter((l) => !checked.some((c) => c.link === l));
		setChecked((list) => [...list, ...fresh.map((link) => ({ link, state: "checking" as const, selected: false }))]);
		setText("");
		await Promise.all(
			fresh.map(async (link) => {
				let info: LinkInfo;
				try {
					info = (await tools?.inspectLink(link)) ?? { ok: false, host: "", reason: "Desktop app only." };
				} catch (e) {
					info = { ok: false, host: (() => { try { return new URL(link).hostname; } catch { return ""; } })(), reason: errorText(e) };
				}
				setChecked((list) => list.map((c) => (c.link === link ? { ...c, state: "ready", info, selected: info.ok } : c)));
			}),
		);
	};

	// Ctrl+V anywhere on the page adds links (DL-01).
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
			const pasted = e.clipboardData?.getData("text") ?? "";
			if (LINK.test(pasted)) void check(pasted);
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	});

	const selected = checked.filter((c) => c.selected && c.info?.ok);

	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-4" data-downloader-add>
			<div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
				<label htmlFor="download-links" className="text-sm font-semibold">
					Paste links, one per line
				</label>
				<textarea
					id="download-links"
					rows={4}
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder={"https://example.com/video.mp4\nhttps://cdn.example.com/stream/master.m3u8"}
					className="rounded-md border bg-transparent p-3 font-mono text-sm"
					data-download-links
					data-no-legacy
				/>
				<div className="flex items-center gap-2">
					<Button onClick={() => void check(text)} disabled={!text.trim()} data-download-check>
						<Link2 /> Check links
					</Button>
					<span className="text-muted-foreground text-xs">
						Works with video and audio files (MP4, MOV, WebM, M4A…), pages that publish their file, and HLS or DASH streams without DRM. Tip: press Ctrl+V anywhere.
					</span>
				</div>
			</div>
			{checked.length > 0 && (
				<div className="flex flex-col gap-2">
					{checked.map((c) => (
						<LinkCard
							key={c.link}
							item={c}
							onToggle={() => setChecked((list) => list.map((x) => (x.link === c.link ? { ...x, selected: !x.selected } : x)))}
							onRemove={() => setChecked((list) => list.filter((x) => x.link !== c.link))}
						/>
					))}
					{checked.some((c) => c.info?.ok) ? (
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								{selected.length} of {checked.length} ready
							</span>
							<Button disabled={!selected.length} onClick={() => setOptions(true)} data-download-options>
								<Download /> Download {selected.length || ""}
							</Button>
						</div>
					) : checked.every((c) => c.state === "ready") ? (
						<p className="text-muted-foreground m-0 text-sm" data-download-none>
							Nothing here can be downloaded. Paste a link that points straight to a video file or stream.
						</p>
					) : null}
				</div>
			)}
			<OptionsDialog
				open={options}
				links={selected}
				onOpenChange={setOptions}
				onQueued={() => {
					setChecked((list) => list.filter((c) => !c.selected));
					onQueued();
				}}
			/>
		</div>
	);
}

function LinkCard({ item, onToggle, onRemove }: { item: Checked; onToggle: () => void; onRemove: () => void }) {
	const info = item.info;
	return (
		<div className={cn("bg-card flex items-start gap-3 rounded-lg border p-3", info && !info.ok && "border-amber-500/40 bg-amber-500/5")} data-link-card={item.state === "checking" ? "checking" : info?.ok ? "ok" : "refused"}>
			{item.state === "checking" ? (
				<span className="border-primary size-4 animate-spin rounded-full border-2 border-t-transparent" />
			) : info?.ok ? (
				<input type="checkbox" checked={item.selected} onChange={onToggle} aria-label="Download this" />
			) : (
				<Ban className="mt-0.5 size-4 shrink-0 text-amber-400" />
			)}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{info?.title ?? item.link}</div>
				{info?.title && <div className="text-muted-foreground truncate font-mono text-[11px]">{item.link}</div>}
				<div className={cn("text-xs", info && !info.ok ? "mt-1 text-amber-300" : "text-muted-foreground truncate")}>
					{item.state === "checking"
						? `Checking ${item.link}…`
						: info?.ok
							? [
									info.host,
									info.kind === "file" ? (info.audio ? "Audio file" : "Video file") : info.kind === "hls" ? "HLS stream" : "DASH stream",
									info.duration ? formatDuration(info.duration) : null,
									info.bytes ? formatBytes(info.bytes) : null,
									info.variants?.length ? info.variants.map((v) => v.label).join(" / ") : null,
									info.subtitles?.length ? `subtitles: ${info.subtitles.map((x) => x.lang).join(", ")}` : null,
								]
									.filter(Boolean)
									.join(" · ")
							: info?.reason}
				</div>
			</div>
			{info?.ok && (
				<span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
					<Check className="mr-1 inline size-3" />
					Can download
				</span>
			)}
			<button type="button" className="text-muted-foreground hover:text-foreground" onClick={onRemove} aria-label="Remove">
				<X className="size-4" />
			</button>
		</div>
	);
}

/** Options and rights (DL-04, DL-05). */
function OptionsDialog({ open, links, onOpenChange, onQueued }: { open: boolean; links: Checked[]; onOpenChange: (o: boolean) => void; onQueued: () => void }) {
	const { rightsHosts, grantRights, add } = useDownloads();
	const [quality, setQuality] = useState("best");
	const [convert, setConvert] = useState("keep");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [after, setAfter] = useState<"library" | "timeline" | "new-project" | "none">("library");
	const openWhenDone = after === "new-project";
	const [track, setTrack] = useState<"auto" | "new">("auto");
	const [folder, setFolder] = useState<string | null>(null);
	const [saveSubs, setSaveSubs] = useState(true);
	const [transcribe, setTranscribe] = useState<string | null>(null);
	const [rights, setRights] = useState(false);
	const hasSubs = links.some((l) => l.info?.subtitles?.length);
	const hosts = [...new Set(links.map((l) => l.info?.host ?? ""))];
	const needRights = hosts.filter((h) => !rightsHosts.includes(h));
	const qualities = useMemo(() => {
		const labels = new Set<string>();
		for (const l of links) for (const v of l.info?.variants ?? []) labels.add(v.label);
		return [...labels];
	}, [links]);

	const queue = () => {
		if (needRights.length && !rights) return toast.error("Tick the box to confirm you have the rights.");
		needRights.forEach(grantRights);
		const start = parseTime(from);
		const end = parseTime(to);
		add(
			links.map((l) => {
				const info = l.info!;
				const variants = info.variants ?? [];
				const variant =
					quality === "smallest" ? variants[variants.length - 1] : variants.find((v) => v.label === quality) ?? variants[0];
				return {
					id: crypto.randomUUID(),
					link: l.link,
					info,
					title: info.title ?? info.name ?? l.link,
					host: info.host,
					mediaUrl: variant?.url ?? info.url ?? l.link,
					quality: quality === "audio" ? "Audio only" : variant?.label ?? "Original",
					audioOnly: quality === "audio",
					convert,
					start,
					end,
					openWhenDone,
					afterDownload: after === "library" || after === "timeline" ? after : "none",
					track,
					...(folder ? { folder } : {}),
					saveSubs,
					transcribe,
					status: "queued",
					received: 0,
					total: info.bytes ?? 0,
					speed: 0,
					addedAt: Date.now(),
				} satisfies DownloadItem;
			}),
		);
		onOpenChange(false);
		onQueued();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md" data-download-dialog>
				<DialogHeader>
					<DialogTitle>Download {links.length} item{links.length === 1 ? "" : "s"}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3 p-4 text-sm">
					<label className="flex flex-col gap-1">
						Quality
						<select className="rounded border bg-transparent p-1.5" value={quality} onChange={(e) => setQuality(e.target.value)} data-download-quality>
							<option value="best">Original / best</option>
							{qualities.map((q) => (
								<option key={q} value={q}>
									{q}
								</option>
							))}
							<option value="smallest">Smallest</option>
							<option value="audio">Audio only</option>
						</select>
					</label>
					<label className="flex flex-col gap-1">
						Format
						<select className="rounded border bg-transparent p-1.5" value={convert} onChange={(e) => setConvert(e.target.value)} data-download-convert>
							<option value="keep">Keep the original</option>
							<option value="mp4-h264">Convert to MP4 (H.264)</option>
							<option value="mp3">Convert to MP3</option>
							<option value="webm-vp9">Convert to WebM</option>
						</select>
					</label>
					<div className="grid grid-cols-2 gap-2">
						<label className="flex flex-col gap-1">
							From (optional)
							<input className="rounded border bg-transparent p-1.5" placeholder="0:00" value={from} onChange={(e) => setFrom(e.target.value)} data-download-from />
						</label>
						<label className="flex flex-col gap-1">
							To (optional)
							<input className="rounded border bg-transparent p-1.5" placeholder="end" value={to} onChange={(e) => setTo(e.target.value)} data-download-to />
						</label>
					</div>
					<fieldset className="flex flex-col gap-1.5" data-download-after>
						<legend className="mb-1">After download</legend>
						{(
							[
								["library", "Add to Media in the open project"],
								["timeline", "Add to the timeline at the playhead"],
								["new-project", "Open in a new project"],
								["none", "Download only"],
							] as const
						).map(([value, label]) => (
							<label key={value} className="flex items-center gap-2">
								<input type="radio" name="download-after" checked={after === value} onChange={() => setAfter(value)} /> {label}
							</label>
						))}
						{after === "timeline" && (
							<select className="ml-6 rounded border bg-transparent p-1.5" value={track} onChange={(e) => setTrack(e.target.value === "new" ? "new" : "auto")} data-download-track>
								<option value="auto">On the first free track</option>
								<option value="new">On a new track at the top</option>
							</select>
						)}
					</fieldset>
					<div className="flex items-center gap-2" data-download-folder>
						<span className="min-w-0 flex-1 truncate" title={folder ?? undefined}>
							Save to: {folder ?? "Downloads › Worksuite"}
						</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void window.worksuite?.tools?.chooseFolder().then((f) => f && setFolder(f))}
						>
							Change…
						</Button>
					</div>
					{hasSubs && (
						<label className="flex items-center gap-2">
							<input type="checkbox" checked={saveSubs} onChange={(e) => setSaveSubs(e.target.checked)} data-download-subs /> Save subtitles as .srt next to the video
						</label>
					)}
					<div className="flex items-center gap-2">
						<label className="flex items-center gap-2">
							<input type="checkbox" checked={!!transcribe} onChange={(e) => setTranscribe(e.target.checked ? "si" : null)} data-download-transcribe /> Transcribe with
							Whisper
						</label>
						{transcribe && (
							<select className="rounded border bg-transparent p-1" value={transcribe} onChange={(e) => setTranscribe(e.target.value)} aria-label="Spoken language">
								{TRANSCRIBE_LANGUAGES.map(([code, label]) => (
									<option key={code} value={code}>
										{label}
									</option>
								))}
							</select>
						)}
					</div>
					{needRights.length > 0 && (
						<label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2" data-download-rights>
							<input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" />
							<span>
								I own this or have permission to download it from <b>{needRights.join(", ")}</b>.
							</span>
						</label>
					)}
					<Button onClick={queue} data-download-queue>
						<Download /> Add to queue
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

const PARALLEL = [1, 2, 3, 4];
const LIMITS = [
	[0, "No limit"],
	[1_000_000, "1 MB/s"],
	[5_000_000, "5 MB/s"],
	[10_000_000, "10 MB/s"],
] as const;

function Queue() {
	const { items, parallel, speedLimit, unmeteredOnly, held, setParallel, setSpeedLimit, setUnmeteredOnly } = useDownloads();
	const list = items.filter((i) => i.status !== "done");
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-3" data-downloader-queue>
			<div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
				<label className="flex items-center gap-2">
					At once
					<select className="rounded border bg-transparent p-1" value={parallel} onChange={(e) => setParallel(Number(e.target.value))}>
						{PARALLEL.map((n) => (
							<option key={n}>{n}</option>
						))}
					</select>
				</label>
				<label className="flex items-center gap-2">
					Speed limit
					<select className="rounded border bg-transparent p-1" value={speedLimit} onChange={(e) => setSpeedLimit(Number(e.target.value))}>
						{LIMITS.map(([v, label]) => (
							<option key={v} value={v}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={unmeteredOnly} onChange={(e) => setUnmeteredOnly(e.target.checked)} data-download-unmetered />
					Wi-Fi or Ethernet only
				</label>
				<span className="ml-auto text-xs">Paused downloads pick up where they stopped, even after a restart.</span>
			</div>
			{held && (
				<p className="m-0 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-300" data-download-held>
					{"Waiting for Wi-Fi or Ethernet: you're on mobile data. Downloads start when you connect, or turn off \"Wi-Fi or Ethernet only\"."}
				</p>
			)}
			{list.length === 0 && <p className="text-muted-foreground py-16 text-center text-sm">Nothing downloading. Add links to start.</p>}
			{list.map((item) => (
				<QueueRow key={item.id} item={item} />
			))}
		</div>
	);
}

function QueueRow({ item }: { item: DownloadItem }) {
	const patch = useDownloads((s) => s.patch);
	const pct = item.total ? (item.received / item.total) * 100 : undefined;
	const left = item.speed > 0 && item.total ? (item.total - item.received) / item.speed : null;
	return (
		<div className="bg-card flex flex-col gap-2 rounded-lg border p-3" data-download-item={item.status}>
			<div className="flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium">{item.title}</div>
					<div className="text-muted-foreground truncate text-xs">
						{item.host} · {item.quality}
						{item.status === "downloading" &&
							(item.info.kind === "file"
								? ` · ${formatBytes(item.received)}${item.total ? ` of ${formatBytes(item.total)}` : ""}${item.speed ? ` · ${formatBytes(item.speed)}/s` : ""}${left !== null ? ` · ${formatDuration(left)} left` : ""}`
								: ` · ${Math.round(pct ?? 0)}%`)}
						{item.status === "processing" && " · converting…"}
						{item.status === "queued" && " · waiting"}
						{item.status === "paused" && " · paused"}
					</div>
				</div>
				{item.status === "downloading" && (
					<Button size="sm" variant="ghost" onClick={() => pauseItem(item.id)} data-download-pause>
						<Pause /> Pause
					</Button>
				)}
				{(item.status === "paused" || item.status === "error") && (
					<Button size="sm" variant="ghost" onClick={() => (item.status === "error" ? patch({ id: item.id, patch: { status: "queued", error: undefined } }) : resumeItem(item.id))} data-download-resume>
						<Play /> {item.status === "error" ? "Retry" : "Resume"}
					</Button>
				)}
				<Button size="sm" variant="ghost" onClick={() => cancelItem(item.id)} aria-label="Cancel">
					<X />
				</Button>
			</div>
			{(item.status === "downloading" || item.status === "paused" || item.status === "processing") && <Progress value={pct} className="h-1.5" />}
			{item.error && <p className="m-0 text-xs text-red-500">{item.error}</p>}
		</div>
	);
}

/** DL-08: everything downloaded, searchable, by source. */
function Library() {
	const editor = useEditor();
	const router = useRouter();
	const { items, remove } = useDownloads();
	const [query, setQuery] = useState("");
	const [source, setSource] = useState("all");
	const done = items.filter((i) => i.status === "done").sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
	const sources = [...new Set(done.map((i) => i.host))];
	const q = query.trim().toLowerCase();
	const shown = done.filter((i) => (source === "all" || i.host === source) && (!q || `${i.title} ${i.host} ${i.path}`.toLowerCase().includes(q)));
	const total = shown.reduce((n, i) => n + (i.bytes ?? 0), 0);
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-3" data-downloader-library>
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
					<input className="w-full rounded-md border bg-transparent py-2 pr-3 pl-8 text-sm" placeholder="Search downloads" value={query} onChange={(e) => setQuery(e.target.value)} />
				</div>
				<select className="rounded-md border bg-transparent p-2 text-sm" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
					<option value="all">All sources</option>
					{sources.map((s) => (
						<option key={s}>{s}</option>
					))}
				</select>
				<span className="text-muted-foreground text-sm" data-library-total>
					{shown.length} · {formatBytes(total)}
				</span>
			</div>
			{shown.length === 0 ? (
				<p className="text-muted-foreground py-16 text-center text-sm">{done.length ? "Nothing matches." : "Finished downloads show up here."}</p>
			) : (
				<ul className="flex flex-col divide-y rounded-lg border">
					{shown.map((i) => (
						<li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm" data-library-row>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{i.title}</div>
								<div className="text-muted-foreground truncate text-xs">
									{i.host} · {i.quality} · {formatBytes(i.bytes ?? 0)} · {new Date(i.finishedAt ?? i.addedAt).toLocaleString()}
								</div>
							</div>
							<Button size="sm" variant="outline" onClick={() => void openSavedInEditor({ editor, filePath: i.path ?? "", push: router.push }).catch((e: unknown) => toast.error(errorText(e)))}>
								<Pencil /> Add to project
							</Button>
							<Button size="sm" variant="ghost" onClick={() => void window.worksuite?.files?.show(i.path ?? "")} aria-label="Show in folder">
								<FolderOpen />
							</Button>
							<Button size="sm" variant="ghost" onClick={() => remove(i.id)} aria-label="Remove from list">
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** True in the Downloader's own window (opened with ?window=1). */
function inOwnWindow(): boolean {
	return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("window") === "1";
}
