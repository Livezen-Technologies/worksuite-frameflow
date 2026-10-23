"use client";

import { CloudUpload, Pause, Play, WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/ui";
import { useNetwork, useUploads } from "../network";

const formatBytes = (bytes: number) =>
	bytes >= 1e9
		? `${(bytes / 1e9).toFixed(1)} GB`
		: bytes >= 1e6
			? `${(bytes / 1e6).toFixed(1)} MB`
			: `${Math.round(bytes / 1e3)} KB`;

const PURPOSE: Record<string, string> = {
	"project-media": "Project media",
	share: "Share link",
	library: "Asset library",
};

const STATE: Record<string, string> = {
	uploading: "Uploading",
	paused: "Paused",
	waiting: "Waiting for network",
	done: "Done",
	error: "Failed",
	cancelled: "Cancelled",
};

/** "Offline" pill that turns offline mode back off (CL-09). */
export function OfflineBadge() {
	const { offline, update } = useNetwork();
	if (!offline) return null;
	return (
		<button
			type="button"
			onClick={() => void update({ offline: false })}
			title="Offline mode is on. Click to go online."
			className="flex h-7 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs text-amber-300 hover:bg-amber-500/20"
			data-offline-badge
		>
			<WifiOff className="size-3.5" /> Offline
		</button>
	);
}

/** Upload queue (CL-08): progress, pause and resume for every cloud upload. */
export function UploadQueueButton() {
	const uploads = useUploads();
	const { bandwidthLimit, offline } = useNetwork();
	const active = uploads.filter(
		(u) =>
			u.state === "uploading" || u.state === "paused" || u.state === "waiting",
	);
	if (uploads.length === 0) return null;
	const sent = active.reduce((n, u) => n + u.sent, 0);
	const total = active.reduce((n, u) => n + u.size, 0);
	const anyRunning = active.some((u) => u.state !== "paused");
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="text"
					size="sm"
					className="relative h-8 gap-1.5 px-2 text-xs"
					data-upload-queue
				>
					<CloudUpload className="size-4" />
					{active.length > 0
						? `${Math.round((sent / Math.max(1, total)) * 100)}%`
						: "Uploads"}
					{active.length > 0 && (
						<span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[9px]">
							{active.length}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex items-center justify-between border-b px-3 py-2">
					<span className="text-sm font-semibold">Uploads</span>
					{active.length > 0 && (
						<Button
							size="sm"
							variant="text"
							className="h-7 text-xs"
							onClick={() =>
								void (anyRunning
									? window.worksuite?.uploads?.pauseAll()
									: window.worksuite?.uploads?.resumeAll())
							}
						>
							{anyRunning ? "Pause all" : "Resume all"}
						</Button>
					)}
				</div>
				<ul className="m-0 flex max-h-80 list-none flex-col overflow-y-auto p-0">
					{uploads.map((u) => {
						const pct = Math.round((u.sent / Math.max(1, u.size)) * 100);
						const canToggle =
							u.state === "uploading" ||
							u.state === "paused" ||
							u.state === "waiting";
						return (
							<li
								key={u.id}
								className="flex flex-col gap-1 border-b px-3 py-2 last:border-b-0"
								data-upload-item={u.state}
							>
								<div className="flex items-center justify-between gap-2">
									<span
										className="min-w-0 truncate text-xs font-medium"
										title={u.name}
									>
										{u.name}
									</span>
									{canToggle && (
										<button
											type="button"
											aria-label={u.state === "paused" ? "Resume" : "Pause"}
											className="text-muted-foreground hover:text-foreground"
											onClick={() =>
												void (u.state === "paused"
													? window.worksuite?.uploads?.resume(u.id)
													: window.worksuite?.uploads?.pause(u.id))
											}
										>
											{u.state === "paused" ? (
												<Play className="size-3.5" />
											) : (
												<Pause className="size-3.5" />
											)}
										</button>
									)}
								</div>
								<div className="bg-muted h-1 overflow-hidden rounded-full">
									<div
										className={cn(
											"h-full",
											u.state === "error"
												? "bg-red-500"
												: u.state === "paused"
													? "bg-amber-400"
													: "bg-primary",
										)}
										style={{ width: `${pct}%` }}
									/>
								</div>
								<div className="text-muted-foreground flex justify-between text-[10px]">
									<span>
										{PURPOSE[u.purpose] ?? "Upload"} ·{" "}
										{u.error ?? STATE[u.state]}
									</span>
									<span>
										{formatBytes(u.sent)} / {formatBytes(u.size)}
									</span>
								</div>
							</li>
						);
					})}
				</ul>
				<div className="text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-[10px]">
					<span>
						{offline
							? "Offline mode is on: uploads wait."
							: bandwidthLimit
								? `Limited to ${formatBytes(bandwidthLimit)}/s`
								: "No speed limit"}
					</span>
					<Link href="/settings" className="hover:text-foreground underline">
						Network settings
					</Link>
				</div>
			</PopoverContent>
		</Popover>
	);
}
