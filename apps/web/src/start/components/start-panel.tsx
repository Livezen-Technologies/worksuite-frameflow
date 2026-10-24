"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FolderOpen, LayoutTemplate, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { foldersBridge } from "@/project-folder/bridge";
import { openProjectFolder } from "@/project-folder/sync";
import type { SettingsTemplate } from "@/project-settings/store";
import { cn } from "@/utils/ui";
import { mediaFilesOnly, useStartIntent, type StartIntent } from "../intent";

const noSubscribe = () => () => {};

/**
 * The startup screen's main choices: record the screen, start an edit, open
 * a project from disk, or drop video files anywhere on the page to start an
 * edit with them.
 */
export function StartPanel() {
	const editor = useEditor();
	const router = useRouter();
	const desktop = useSyncExternalStore(noSubscribe, () => !!foldersBridge(), () => false);
	const [dragging, setDragging] = useState(false);
	const [busy, setBusy] = useState(false);

	const start = async ({ intent, template, name }: { intent?: StartIntent; template?: SettingsTemplate; name: string }) => {
		if (busy) return;
		setBusy(true);
		try {
			const projectId = await editor.project.createNewProject({ name, settings: template?.settings });
			if (intent) useStartIntent.getState().set({ projectId, intent });
			router.push(`/editor/${projectId}`);
		} catch (error) {
			setBusy(false);
			toast.error("Couldn't create the project", { description: error instanceof Error ? error.message : String(error) });
		}
	};

	// The desktop app records in its own small window; the browser records in the editor.
	const record = () => {
		const recorder = window.worksuite?.recorder;
		if (recorder) void recorder.open();
		else void start({ intent: { kind: "record" }, name: "Screen recording" });
	};

	const openExisting = () =>
		void openProjectFolder()
			.then((opened) => opened && router.push(`/editor/${opened.projectId}`))
			.catch((error: unknown) =>
				toast.error("Couldn't open the project", { description: error instanceof Error ? error.message : String(error) }),
			);

	// Drop video files anywhere on the page to start a project with them.
	useEffect(() => {
		let depth = 0;
		const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
		const onEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			depth++;
			setDragging(true);
		};
		const onLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			depth = Math.max(0, depth - 1);
			if (!depth) setDragging(false);
		};
		const onOver = (e: DragEvent) => {
			if (hasFiles(e)) e.preventDefault();
		};
		const onDrop = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			depth = 0;
			setDragging(false);
			const files = mediaFilesOnly([...(e.dataTransfer?.files ?? [])]);
			if (!files.length) {
				toast.error("Drop video, audio or image files to start a project");
				return;
			}
			const first = files[0].name.replace(/\.[^.]+$/, "");
			void start({ intent: { kind: "import", files }, name: files.length === 1 ? first : "New project" });
		};
		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("dragover", onOver);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("drop", onDrop);
		};
	});

	// Ctrl+N: new video project; Ctrl+Shift+R: new screen recording.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
			const key = e.key.toLowerCase();
			if (key === "n" && !e.shiftKey) {
				e.preventDefault();
				void start({ name: "New project" });
			} else if (key === "r" && e.shiftKey) {
				e.preventDefault();
				record();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const card =
		"group border-border bg-card hover:border-primary flex flex-col overflow-hidden border text-left transition-colors disabled:opacity-60";
	const art = "relative flex h-44 shrink-0 items-center justify-center overflow-hidden bg-[#0f1a33]";
	const kbd = "text-muted-foreground border px-1.5 py-0.5 font-mono text-[11px]";
	const small = "border-border bg-card hover:border-primary flex items-start gap-4 border p-5 text-left transition-colors";

	return (
		<section className="flex flex-col gap-5" aria-label="Start" data-start-panel>
			<div className="grid gap-5 lg:grid-cols-3">
				<button type="button" className={card} disabled={busy} onClick={() => void start({ name: "New project" })} data-start="edit">
					<div className={art} aria-hidden>
						<div className="flex w-[88%] flex-col gap-2.5">
							<div className="flex h-16 items-center justify-center bg-[#1a2a52]">
								<span className="size-0 border-y-[11px] border-l-[18px] border-y-transparent border-l-white" />
							</div>
							<div className="relative flex flex-col gap-1.5">
								<div className="flex gap-1">
									<span className="h-3 w-1/3 bg-[#2563eb]" />
									<span className="h-3 w-1/5 bg-[#2563eb]" />
									<span className="h-3 flex-1 bg-[#2563eb]" />
								</div>
								<div className="flex gap-1">
									<span className="h-3 w-1/5 bg-[#06b6d4]" />
									<span className="h-3 w-1/3 bg-[#22d3ee]" />
								</div>
								<span className="h-2 w-2/3 bg-[#334a7a]" />
								<span className="absolute -top-2 -bottom-1 left-[59%] w-0.5 bg-white" />
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-2 p-5">
						<div className="flex items-center gap-2">
							<span className="flex-1 text-lg font-semibold">New video project</span>
							<span className={kbd}>Ctrl N</span>
						</div>
						<span className="text-muted-foreground text-sm">Edit videos, photos and audio on a multi-track timeline.</span>
					</div>
				</button>
				<button
					type="button"
					className={card}
					disabled={busy}
					onClick={record}
					data-start="record"
				>
					<div className={art} aria-hidden>
						<div className="relative h-28 w-56 border-2 border-[#3b5ba5] bg-[#16264a] p-3">
							<span className="block h-2 w-1/2 bg-[#3b5ba5]" />
							<span className="mt-2 block h-[60%] border-2 border-dashed border-[#22d3ee]" />
							<span className="absolute -top-3 -right-4 flex items-center gap-1 bg-[#ef4444] px-2 py-0.5 text-[10px] font-semibold text-white">
								<span className="size-1.5 bg-white" data-keep-round style={{ borderRadius: 9999 }} /> REC
							</span>
							<span className="absolute -bottom-5 -left-6 size-12 bg-[#22d3ee]" data-keep-round style={{ borderRadius: 9999 }} />
						</div>
					</div>
					<div className="flex flex-col gap-2 p-5">
						<div className="flex items-center gap-2">
							<span className="flex-1 text-lg font-semibold">New screen recording</span>
							<span className={kbd}>Ctrl Shift R</span>
						</div>
						<span className="text-muted-foreground text-sm">
							Record the whole screen, a window or an area, with microphone, system audio and camera.
						</span>
					</div>
				</button>
				<button type="button" className={card} onClick={() => router.push("/motion")} data-start="motion">
					<div className={art} aria-hidden>
						<span className="absolute top-6 right-6 bg-[#dc2626] px-3 py-1.5 text-xs font-semibold text-white">Subscribe</span>
						<div className="absolute top-[38%] left-6 flex flex-col gap-1.5">
							<span className="border-l-4 border-[#22d3ee] bg-[#2563eb] px-4 py-1.5 text-sm font-semibold text-white">Lower third title</span>
							<span className="ml-2 w-fit bg-white px-3 py-1 text-[11px] text-slate-900">Subtitle and role</span>
						</div>
						<Sparkles className="absolute right-8 bottom-8 size-9 text-[#60a5fa]" />
					</div>
					<div className="flex flex-col gap-2 p-5">
						<div className="flex items-center gap-2">
							<span className="flex-1 text-lg font-semibold">Motion graphics</span>
							<span className="border-primary text-primary border px-1.5 py-0.5 font-mono text-[11px]">LOTTIE</span>
						</div>
						<span className="text-muted-foreground text-sm">
							Animated titles, lower thirds, subscribe buttons and stickers. Design in Motion Studio, import Lottie and
							edit colours, words and timing.
						</span>
					</div>
				</button>
			</div>
			<div className="grid gap-5 lg:grid-cols-3">
				<div className={cn(small, "cursor-default")}>
					<span className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center">
						<LayoutTemplate className="size-5" />
					</span>
					<span className="flex min-w-0 flex-col gap-1">
						<button
							type="button"
							className="hover:text-primary text-left font-semibold"
							disabled={busy}
							onClick={() => router.push("/templates")}
							data-start="templates"
						>
							Templates
						</button>
						<span className="text-muted-foreground text-sm">Start from a ready-made video template.</span>
						<span className="mt-1 flex flex-wrap gap-2">
							{[
								["youtube-1080", "16:9 YouTube"],
								["tiktok", "9:16 Reels"],
								["instagram-square", "1:1 Post"],
							].map(([id, label]) => (
								<button
									key={id}
									type="button"
									disabled={busy}
									className="hover:border-primary border px-2.5 py-1 font-mono text-xs"
									onClick={() => router.push(`/templates?aspect=${id}`)}
									data-start-size={id}
								>
									{label}
								</button>
							))}
						</span>
					</span>
				</div>
				<button type="button" className={small} onClick={openExisting} disabled={!desktop} data-start="open" title={desktop ? undefined : "Available in the desktop app"}>
					<span className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center">
						<FolderOpen className="size-5" />
					</span>
					<span className="flex flex-col gap-1">
						<span className="font-semibold">Open existing project</span>
						<span className="text-muted-foreground text-sm">Open a FrameFlow project folder from this computer.</span>
					</span>
				</button>
				<div className={cn(small, "border-primary/50 cursor-default border-dashed hover:border-primary/50")} data-start-dropzone>
					<span className="flex size-10 shrink-0 items-center justify-center bg-[#22d3ee]/15 text-[#22d3ee]">
						<Upload className="size-5" />
					</span>
					<span className="flex flex-col gap-1">
						<span className="font-semibold">Drop files to start</span>
						<span className="text-muted-foreground text-sm">Drag video, audio or images anywhere on this screen.</span>
						<span className="text-muted-foreground font-mono text-[11px]">MP4 · MOV · WEBM · MP3 · WAV · PNG · JPG</span>
					</span>
				</div>
			</div>
			{dragging && (
				<div
					className="border-primary bg-background/85 pointer-events-none fixed inset-3 z-50 flex items-center justify-center border-2 border-dashed"
					data-start-drop
				>
					<span className="text-lg font-semibold">Drop to start a new project with these files</span>
				</div>
			)}
		</section>
	);
}
