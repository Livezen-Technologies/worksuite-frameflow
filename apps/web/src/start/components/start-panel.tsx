"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, Clapperboard, FolderOpen, MonitorPlay, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { foldersBridge } from "@/project-folder/bridge";
import { openProjectFolder } from "@/project-folder/sync";
import { BUILT_IN_TEMPLATES, type SettingsTemplate, useProjectSettings } from "@/project-settings/store";
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
	const templates = useProjectSettings((s) => s.templates);
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

	const tile = "border-border bg-card hover:border-primary hover:bg-accent/40 flex min-h-28 flex-1 items-start gap-4 border p-5 text-left transition-colors disabled:opacity-60";

	return (
		<section className="px-4" aria-label="Start" data-start-panel>
			<div className="flex flex-col gap-3 md:flex-row">
				<button
					type="button"
					className={tile}
					disabled={busy}
					onClick={() => void start({ intent: { kind: "record" }, name: "Screen recording" })}
					data-start="record"
				>
					<MonitorPlay className="text-primary size-7 shrink-0" />
					<span className="flex flex-col gap-1">
						<span className="text-base font-semibold">New screen recording</span>
						<span className="text-muted-foreground text-sm">
							Record the whole screen, a window or an area, with microphone, system audio and camera.
						</span>
					</span>
				</button>
				<div className="flex flex-1">
					<button
						type="button"
						className={cn(tile, "border-r-0")}
						disabled={busy}
						onClick={() => void start({ name: "New project" })}
						data-start="edit"
					>
						<Clapperboard className="text-primary size-7 shrink-0" />
						<span className="flex flex-col gap-1">
							<span className="text-base font-semibold">New video project</span>
							<span className="text-muted-foreground text-sm">
								Edit videos, photos and audio on a multi-track timeline.
							</span>
						</span>
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="border-border bg-card hover:bg-accent/40 border px-3"
								aria-label="New video project with a size and frame rate"
								disabled={busy}
								data-start="edit-template"
							>
								<ChevronDown className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-64">
							{[...BUILT_IN_TEMPLATES, ...templates].map((t) => (
								<DropdownMenuItem key={t.id} onClick={() => void start({ template: t, name: "New project" })}>
									{t.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				{desktop && (
					<button type="button" className={tile} onClick={openExisting} data-start="open">
						<FolderOpen className="text-primary size-7 shrink-0" />
						<span className="flex flex-col gap-1">
							<span className="text-base font-semibold">Open existing project</span>
							<span className="text-muted-foreground text-sm">Open a FrameFlow project folder from this computer.</span>
						</span>
					</button>
				)}
			</div>
			<p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
				<Upload className="size-3.5" /> Drop video files anywhere here to start a project with them.
			</p>
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
