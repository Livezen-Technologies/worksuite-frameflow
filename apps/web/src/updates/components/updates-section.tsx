"use client";

import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/ui";
import { useUpdates } from "../use-updates";

function statusText(
	state: NonNullable<ReturnType<typeof useUpdates>["state"]>,
) {
	switch (state.status) {
		case "checking":
			return "Checking the download center…";
		case "available":
			return state.selfInstall
				? `Version ${state.version} is available.`
				: `Version ${state.version} is available from the download center.`;
		case "downloading":
			return `Downloading version ${state.version}… ${Math.round(state.progress * 100)}%`;
		case "ready":
			return `Version ${state.version} is ready. Restart FrameFlow to finish updating.`;
		case "up-to-date":
			return "You have the latest version.";
		case "error":
			return `Update problem: ${state.error}`;
		case "unsupported":
			return state.error ?? "Updates aren't available here.";
		default:
			return "";
	}
}

/** Settings › Updates: channel, automatic checks, check now, install. */
export function UpdatesSection() {
	const { state, bridge } = useUpdates();
	if (!state || !bridge) return null;
	return (
		<div className="flex flex-col gap-3" data-updates-section>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-sm">
					FrameFlow <b>{state.currentVersion}</b>
				</span>
				<div className="flex gap-2">
					{state.status === "ready" ? (
						<Button size="sm" onClick={() => void bridge.install()}>
							<RefreshCw /> Restart to update
						</Button>
					) : state.status === "available" ||
						(state.status === "error" && state.selfInstall && !!state.version) ? (
						<Button size="sm" onClick={() => void bridge.download()}>
							<Download />{" "}
							{state.selfInstall ? "Download update" : "Open download center"}
						</Button>
					) : (
						<Button
							size="sm"
							variant="outline"
							disabled={
								state.status === "checking" || state.status === "downloading"
							}
							onClick={() => void bridge.check()}
						>
							<RefreshCw
								className={cn(state.status === "checking" && "animate-spin")}
							/>{" "}
							Check for updates
						</Button>
					)}
				</div>
			</div>
			{statusText(state) && (
				<p className="text-muted-foreground m-0 text-sm">{statusText(state)}</p>
			)}
			{state.status === "downloading" && (
				<div className="flex flex-col gap-1.5">
					{/* Eased so a few updates a second still move smoothly. */}
					<Progress
						value={state.progress * 100}
						className="[&>div]:transition-transform [&>div]:duration-500 [&>div]:ease-linear"
					/>
					{state.detail && (
						<span className="text-muted-foreground text-xs tabular-nums" data-update-detail>
							{state.detail}
						</span>
					)}
				</div>
			)}
			<div className="flex flex-wrap items-center gap-4 text-sm">
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						className="accent-primary size-3.5"
						checked={state.auto}
						onChange={(e) => void bridge.configure({ auto: e.target.checked })}
					/>
					Check automatically
				</label>
				<label className="flex items-center gap-2">
					Channel
					<select
						className="bg-background rounded-md border px-2 py-1 text-sm"
						value={state.channel}
						onChange={(e) =>
							void bridge.configure({
								channel: e.target.value === "beta" ? "beta" : "stable",
							})
						}
					>
						<option value="stable">Stable</option>
						<option value="beta">Beta</option>
					</select>
				</label>
			</div>
			{!state.selfInstall && (
				<p className="text-muted-foreground m-0 text-xs">
					On this system FrameFlow can&rsquo;t replace itself, so new versions
					open the{" "}
					<a
						href={state.downloadPage}
						target="_blank"
						rel="noreferrer"
						className="underline"
					>
						Worksuite download center
					</a>
					.
				</p>
			)}
		</div>
	);
}
