"use client";

import { FolderOpen, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useExportHistory } from "@/export/history";
import { cn } from "@/utils/ui";
import { formatBytes, LibraryPageShell } from "./page-shell";

/** Everything exported on this device, newest first. */
export function ExportsList() {
	const router = useRouter();
	const entries = useExportHistory((s) => s.entries);
	const { remove, clear } = useExportHistory.getState();
	const [format, setFormat] = useState<string>("all");
	const formats = useMemo(() => [...new Set(entries.map((e) => e.format))].sort(), [entries]);
	const shown = entries.filter((e) => format === "all" || e.format === format);
	const desktop = typeof window !== "undefined" && !!window.worksuite?.files;

	return (
		<LibraryPageShell
			title="Exports"
			subtitle="Videos, GIFs, pictures and audio you've exported, newest first."
			actions={
				entries.length ? (
					<Button variant="ghost" size="sm" onClick={() => window.confirm("Clear the export history? Your files stay where they are.") && clear()}>
						Clear history
					</Button>
				) : null
			}
		>
			{formats.length > 1 && (
				<div className="mb-4 flex flex-wrap gap-1">
					{["all", ...formats].map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFormat(f)}
							className={cn("border px-3 py-1 text-sm uppercase", format === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
						>
							{f === "all" ? "All" : f}
						</button>
					))}
				</div>
			)}
			{shown.length === 0 ? (
				<p className="text-muted-foreground py-10 text-center text-sm">No exports yet. Finished exports show up here.</p>
			) : (
				<div className="divide-y border" data-exports-list>
					{shown.map((e) => (
						<div key={e.id} className="hover:bg-accent/40 flex items-center gap-3 px-3 py-2" data-export-row={e.fileName}>
							<span className="bg-primary/15 text-primary w-14 shrink-0 py-1 text-center font-mono text-xs uppercase">{e.format}</span>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm">{e.fileName}</div>
								<div className="text-muted-foreground truncate text-[11px]">
									{e.projectName} · {formatBytes(e.bytes)}
									{e.width && e.height ? ` · ${e.width}×${e.height}` : ""} · {new Date(e.at).toLocaleString()}
									{e.path ? ` · ${e.path}` : " · downloaded"}
								</div>
							</div>
							{desktop && e.path && (
								<Button
									variant="outline"
									size="sm"
									onClick={async () => {
										const ok = await window.worksuite?.files?.show(e.path ?? "");
										if (ok === false) toast.error("That file was moved or deleted.");
									}}
								>
									<FolderOpen className="size-3.5" /> Show in folder
								</Button>
							)}
							<Button variant="ghost" size="sm" onClick={() => router.push(`/editor/${e.projectId}`)}>
								Open project
							</Button>
							<button type="button" aria-label="Remove from history" className="text-muted-foreground hover:text-foreground p-1" onClick={() => remove(e.id)}>
								<Trash2 className="size-3.5" />
							</button>
						</div>
					))}
				</div>
			)}
		</LibraryPageShell>
	);
}
