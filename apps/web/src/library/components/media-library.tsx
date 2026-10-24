"use client";

import { Download, FilePlus2, FolderOpen, ImageIcon, Music, Search, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { storageService } from "@/services/storage/service";
import type { MediaAssetData } from "@/services/storage/types";
import { useStartIntent } from "@/start/intent";
import { cn } from "@/utils/ui";
import { formatBytes, LibraryPageShell } from "./page-shell";

interface Item extends MediaAssetData {
	projectId: string;
	projectName: string;
}

type Filter = "all" | "video" | "image" | "audio";

function formatDuration(seconds?: number) {
	if (!seconds) return "";
	const s = Math.round(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Every file in every project on this device, in one place. */
export function MediaLibrary() {
	const editor = useEditor();
	const router = useRouter();
	const [items, setItems] = useState<Item[] | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const projects = await storageService.loadAllProjectsMetadata();
			const lists = await Promise.all(
				projects.map(async (p) =>
					(await storageService.listMediaMetadata({ projectId: p.id }).catch(() => [])).filter((m) => !m.ephemeral).map((m) => ({ ...m, projectId: p.id, projectName: p.name })),
				),
			);
			if (!cancelled) setItems(lists.flat().sort((a, b) => b.lastModified - a.lastModified));
		})().catch(() => !cancelled && setItems([]));
		return () => {
			cancelled = true;
		};
	}, []);

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (items ?? []).filter((m) => (filter === "all" || m.type === filter) && (!q || m.name.toLowerCase().includes(q) || m.projectName.toLowerCase().includes(q)));
	}, [items, filter, query]);
	const counts = useMemo(() => {
		const c = { all: items?.length ?? 0, video: 0, image: 0, audio: 0 };
		for (const m of items ?? []) c[m.type] += 1;
		return c;
	}, [items]);

	const file = async (m: Item) => {
		const f = await storageService.loadMediaFile({ projectId: m.projectId, id: m.id });
		if (!f) throw new Error("The file isn't on this device any more.");
		return f;
	};
	const download = async (m: Item) => {
		try {
			const f = await file(m);
			const url = URL.createObjectURL(f);
			const a = document.createElement("a");
			a.href = url;
			a.download = m.name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 5000);
		} catch (error) {
			toast.error("Couldn't download", { description: error instanceof Error ? error.message : String(error) });
		}
	};
	const startWith = async (m: Item) => {
		try {
			const f = await file(m);
			const projectId = await editor.project.createNewProject({ name: m.name.replace(/\.[^.]+$/, "") || "New project" });
			useStartIntent.getState().set({ projectId, intent: { kind: "import", files: [new File([f], m.name, { type: f.type })] } });
			router.push(`/editor/${projectId}`);
		} catch (error) {
			toast.error("Couldn't start a project", { description: error instanceof Error ? error.message : String(error) });
		}
	};
	const Icon = ({ type }: { type: MediaAssetData["type"] }) =>
		type === "video" ? <Video className="size-6" /> : type === "audio" ? <Music className="size-6" /> : <ImageIcon className="size-6" />;

	return (
		<LibraryPageShell title="Media library" subtitle="Every video, picture and sound in your projects on this computer.">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<label className="bg-muted/50 flex h-9 w-72 items-center gap-2 border px-2">
					<Search className="text-muted-foreground size-4" />
					<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files or projects" className="min-w-0 flex-1 bg-transparent text-sm outline-none" data-media-search />
				</label>
				{(["all", "video", "image", "audio"] as const).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => setFilter(f)}
						className={cn("h-9 border px-3 text-sm", filter === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
						data-media-filter={f}
					>
						{f === "all" ? "All" : f === "video" ? "Videos" : f === "image" ? "Pictures" : "Audio"} <span className="opacity-70">{counts[f]}</span>
					</button>
				))}
			</div>
			{items === null ? (
				<p className="text-muted-foreground text-sm">Loading…</p>
			) : shown.length === 0 ? (
				<p className="text-muted-foreground py-10 text-center text-sm">{items.length ? "Nothing matches." : "No media yet. Files you import into projects show up here."}</p>
			) : (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-media-grid>
					{shown.map((m) => (
						<div key={`${m.projectId}/${m.id}`} className="group bg-card hover:border-primary flex flex-col border" data-media-item={m.name}>
							<div className="bg-muted/40 text-muted-foreground relative flex aspect-video items-center justify-center overflow-hidden">
								{m.thumbnailUrl ? (
									// eslint-disable-next-line @next/next/no-img-element -- stored data URL
									<img src={m.thumbnailUrl} alt="" className="size-full object-cover" />
								) : (
									<Icon type={m.type} />
								)}
								{m.duration ? <span className="absolute right-1 bottom-1 bg-black/70 px-1 text-[10px] text-white">{formatDuration(m.duration)}</span> : null}
								<div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/55 group-hover:flex">
									<button type="button" title="New project with this file" onClick={() => void startWith(m)} className="bg-background/90 p-1.5" data-media-new-project>
										<FilePlus2 className="size-4" />
									</button>
									<button type="button" title="Open its project" onClick={() => router.push(`/editor/${m.projectId}`)} className="bg-background/90 p-1.5">
										<FolderOpen className="size-4" />
									</button>
									<button type="button" title="Download" onClick={() => void download(m)} className="bg-background/90 p-1.5">
										<Download className="size-4" />
									</button>
								</div>
							</div>
							<div className="min-w-0 p-2">
								<div className="truncate text-sm" title={m.name}>
									{m.name}
								</div>
								<div className="text-muted-foreground truncate text-[11px]">
									{m.projectName} · {formatBytes(m.size)}
									{m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</LibraryPageShell>
	);
}
