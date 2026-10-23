"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Cloud, CloudOff, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCloudSync } from "@/cloud/store";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { useProjectTabs } from "../store";
import { cycleTab, SOFT_TAB_LIMIT, tabForNumber } from "../tabs";

/** Tabs of open projects across the top of the editor (SRS MP-01–MP-11). */
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

	if (tabs.length === 0) return null;

	return (
		<div
			className="bg-sidebar flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b px-2 pt-1"
			role="tablist"
			aria-label="Open projects"
			data-project-tabs
		>
			{tabs.map((tab, index) => {
				const active = tab.id === activeId;
				const link = links[tab.id];
				const state = statuses[tab.id]?.state;
				return (
					<div
						key={tab.id}
						role="tab"
						aria-selected={active}
						tabIndex={0}
						draggable
						data-project-tab={tab.id}
						title={tab.name}
						onDragStart={() => {
							dragFrom.current = index;
						}}
						onDragOver={(e) => e.preventDefault()}
						onDrop={() => {
							if (dragFrom.current !== null)
								useProjectTabs
									.getState()
									.move({ from: dragFrom.current, to: index });
							dragFrom.current = null;
						}}
						onClick={() => !active && void go(tab.id)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !active) void go(tab.id);
						}}
						onAuxClick={(e) => {
							if (e.button === 1) void close(tab.id);
						}}
						className={cn(
							"group flex h-8 max-w-56 min-w-28 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 text-xs select-none",
							active
								? "bg-background text-foreground"
								: "text-muted-foreground hover:bg-accent/50 border-transparent",
						)}
					>
						{state === "syncing" ? (
							<Loader2 className="size-3 shrink-0 animate-spin" />
						) : link ? (
							<Cloud
								className="size-3 shrink-0 text-sky-400"
								aria-label="Local + Cloud"
							/>
						) : (
							<CloudOff
								className="size-3 shrink-0 opacity-50"
								aria-label="Local"
							/>
						)}
						<span className="min-w-0 flex-1 truncate">{tab.name}</span>
						{active && dirty ? (
							<span
								className="size-1.5 shrink-0 rounded-full bg-amber-400"
								title="Saving…"
							/>
						) : null}
						<button
							type="button"
							aria-label={`Close ${tab.name}`}
							onClick={(e) => {
								e.stopPropagation();
								void close(tab.id);
							}}
							className={cn(
								"hover:bg-accent rounded p-0.5",
								active ? "opacity-70" : "opacity-0 group-hover:opacity-70",
							)}
						>
							<X className="size-3" />
						</button>
					</div>
				);
			})}
			<button
				type="button"
				aria-label="Open another project"
				title="Open another project"
				onClick={() => void go(null)}
				className="text-muted-foreground hover:bg-accent mb-1 ml-1 flex size-7 items-center justify-center rounded-md"
				data-new-tab
			>
				<Plus className="size-4" />
			</button>
		</div>
	);
}
