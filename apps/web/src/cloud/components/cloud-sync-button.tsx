"use client";

import { useState } from "react";
import {
	Cloud,
	CloudOff,
	Loader2,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { useCloudSync } from "../store";
import { disableSync, enableSync, syncProject } from "../sync";

function timeAgo(iso: string | null): string {
	if (!iso) return "never";
	const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
	return new Date(iso).toLocaleDateString();
}

/** "Sync to Worksuite Cloud" for the open project (CL-02); hidden when signed out (CL-09). */
export function CloudSyncButton() {
	const editor = useEditor();
	const { state } = useWorksuiteAccount();
	const project = useEditor((e) => e.project.getActiveOrNull());
	const projectId = project?.metadata.id ?? "";
	const link = useCloudSync((s) => s.links[projectId]);
	const status = useCloudSync((s) => s.status[projectId]) ?? { state: "idle" };
	const [open, setOpen] = useState(false);

	if (state?.status !== "signed-in" || !project) return null;

	const synced = !!link;
	const busy = status.state === "syncing";
	const icon = !synced ? (
		<CloudOff className="size-4" />
	) : busy ? (
		<Loader2 className="size-4 animate-spin" />
	) : status.state === "error" || status.state === "conflict" ? (
		<TriangleAlert className="size-4 text-amber-400" />
	) : (
		<Cloud className="size-4 text-sky-400" />
	);

	const saveThenSync = async () => {
		// Make sure the latest edits are on disk before reading them.
		await editor.save.flush();
		await syncProject({ projectId }).catch(() => {});
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					aria-label="Cloud sync"
					data-cloud-sync={synced ? status.state : "off"}
				>
					{icon}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="flex w-80 flex-col gap-3 p-3" align="end">
				<div className="flex items-center justify-between gap-3">
					<div className="flex flex-col">
						<span className="text-sm font-medium">Sync to Worksuite Cloud</span>
						<span className="text-muted-foreground text-xs">
							Open this project on your other devices.
						</span>
					</div>
					<Switch
						aria-label="Sync to Worksuite Cloud"
						checked={synced}
						onCheckedChange={(on) => {
							if (on) {
								void editor.save
									.flush()
									.then(() => enableSync({ projectId }))
									.catch(() => {});
							} else disableSync({ projectId });
						}}
					/>
				</div>
				{synced && (
					<div
						className="flex flex-col gap-2 border-t pt-3 text-xs"
						data-cloud-status
					>
						{status.state === "syncing" ? (
							<>
								<span className="text-muted-foreground">{status.message}</span>
								<Progress value={status.progress * 100} />
							</>
						) : status.state === "error" ? (
							<span className="text-destructive">{status.message}</span>
						) : status.state === "conflict" ? (
							<div className="flex flex-col gap-1.5">
								<span>
									This project was also changed on another device. Both versions
									were kept: yours is in the cloud now, and the other one was
									saved as a separate project.
								</span>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setOpen(false);
										// A full load: the editor doesn't swap projects in place.
										window.location.assign(`/editor/${status.otherProjectId}`);
									}}
								>
									Open other version
								</Button>
							</div>
						) : (
							<span className="text-muted-foreground">
								Synced {timeAgo(link.syncedAt)}
								{link.revision ? ` · revision ${link.revision}` : ""}
							</span>
						)}
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							className={cn("self-start")}
							onClick={() => void saveThenSync()}
						>
							<RefreshCw />
							Sync now
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
