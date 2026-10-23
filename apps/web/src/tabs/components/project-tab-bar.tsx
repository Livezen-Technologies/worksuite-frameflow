"use client";

import { useProjectSettings } from "@/project-settings/store";
import { Settings } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Cloud, CloudOff, Loader2, Plus, X } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useCloudSync } from "@/cloud/store";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { useProjectTabs } from "../store";
import { cycleTab, SOFT_TAB_LIMIT, tabForNumber } from "../tabs";

/** Switcher for the open projects, in the editor header (SRS MP-01–MP-11). */
export function ProjectTabBar() {
	const router = useRouter();
	const editor = useEditor();
	const tabs = useProjectTabs((s) => s.tabs);
	const activeId = useEditor(
		(e) => e.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const activeName = useEditor(
		(e) => e.project.getActiveOrNull()?.metadata.name ?? null,
	);
	const links = useCloudSync((s) => s.links);
	const statuses = useCloudSync((s) => s.status);
	const dirty = useEditor((e) => e.save.getIsDirty());
	const dragFrom = useRef<number | null>(null);

	// Keep the tab's name in step with renames.
	useEffect(() => {
		if (activeId && activeName)
			useProjectTabs.getState().open({ id: activeId, name: activeName });
	}, [activeId, activeName]);

	useEffect(() => {
		if (tabs.length === SOFT_TAB_LIMIT + 1) {
			toast.warning(
				`${tabs.length} projects are open. Close some to keep the editor fast.`,
			);
		}
	}, [tabs.length]);

	const go = async (id: string | null) => {
		await editor.save.flush().catch(() => {});
		router.push(id ? `/editor/${id}` : "/projects");
	};

	const close = async (id: string) => {
		if (id === activeId) await editor.save.flush().catch(() => {});
		const next = useProjectTabs.getState().close(id);
		if (id === activeId) router.push(next ? `/editor/${next}` : "/projects");
	};

	// Ctrl/Cmd+Tab, Ctrl/Cmd+1–9, Ctrl/Cmd+W, Ctrl/Cmd+Shift+T (MP-03).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
			const list = useProjectTabs.getState().tabs;
			let target: string | null | undefined;
			if (e.key === "Tab")
				target = cycleTab({ tabs: list, activeId, step: e.shiftKey ? -1 : 1 });
			else if (/^[1-9]$/.test(e.key) && !e.shiftKey)
				target = tabForNumber({ tabs: list, n: Number(e.key) });
			else if (e.key.toLowerCase() === "w" && !e.shiftKey && activeId) {
				e.preventDefault();
				e.stopPropagation();
				void close(activeId);
				return;
			} else if (e.key.toLowerCase() === "t" && e.shiftKey) {
				const tab = useProjectTabs.getState().reopenClosed();
				if (tab) target = tab.id;
			}
			if (target === undefined) return;
			e.preventDefault();
			e.stopPropagation();
			if (target && target !== activeId) void go(target);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});

	const activeTab = tabs.find((t) => t.id === activeId);
	const name = activeName ?? activeTab?.name ?? "Project";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Switch project"
					title="Open projects (Ctrl+1–9)"
					className="hover:bg-accent flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5"
					data-project-switcher
				>
					<span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
						{name.trim().charAt(0).toUpperCase() || "P"}
					</span>
					{tabs.length > 1 ? (
						<span className="bg-accent text-muted-foreground rounded px-1 text-[10px] tabular-nums">
							{tabs.length}
						</span>
					) : null}
					<ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80 p-1.5" data-project-tabs>
				{tabs.map((tab, index) => {
					const active = tab.id === activeId;
					const link = links[tab.id];
					const state = statuses[tab.id]?.state;
					return (
						<DropdownMenuItem
							key={tab.id}
							data-project-tab={tab.id}
							draggable
							onDragStart={() => {
								dragFrom.current = index;
							}}
							onDragOver={(e) => e.preventDefault()}
							onDrop={() => {
								if (dragFrom.current !== null)
									useProjectTabs.getState().move({ from: dragFrom.current, to: index });
								dragFrom.current = null;
							}}
							onSelect={() => {
								if (!active) void go(tab.id);
							}}
							className={cn(
								"group flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm",
								active && "bg-accent",
							)}
						>
							{state === "syncing" ? (
								<Loader2 className="size-3.5 shrink-0 animate-spin" />
							) : link ? (
								<Cloud className="size-3.5 shrink-0 text-sky-400" aria-label="Local + Cloud" />
							) : (
								<CloudOff className="size-3.5 shrink-0 opacity-50" aria-label="Local" />
							)}
							<span className="min-w-0 flex-1 truncate">{tab.name}</span>
							{index < 9 ? (
								<span className="text-muted-foreground text-[10px]">Ctrl+{index + 1}</span>
							) : null}
							{active && dirty ? (
								<span className="size-1.5 shrink-0 rounded-full bg-amber-400" title="Saving…" />
							) : null}
							{active ? (
								<Check className="text-primary size-4 shrink-0" />
							) : (
								<button
									type="button"
									aria-label={`Close ${tab.name}`}
									onPointerDown={(e) => e.stopPropagation()}
									onClick={(e) => {
										e.stopPropagation();
										e.preventDefault();
										void close(tab.id);
									}}
									className="hover:bg-background rounded p-0.5 opacity-0 group-hover:opacity-70"
								>
									<X className="size-3.5" />
								</button>
							)}
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => useProjectSettings.getState().setOpen(true)}
					className="gap-2.5 px-3"
				>
					<Settings className="size-4" /> Project settings
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => void go(null)} data-new-tab className="gap-2.5 px-3">
					<Plus className="size-4" /> Open another project
				</DropdownMenuItem>
				{activeId ? (
					<DropdownMenuItem onSelect={() => void close(activeId)} className="gap-2.5 px-3">
						<X className="size-4" /> Close this project
						<span className="text-muted-foreground ml-auto text-[10px]">Ctrl+W</span>
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
