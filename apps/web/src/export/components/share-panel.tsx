"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import type { CloudShareResult, CloudUploadProgress } from "@/account/types";
import { cn } from "@/utils/ui";

export const SHARE_EXPIRY_CHOICES = [
	{ days: 1, label: "1 day" },
	{ days: 7, label: "7 days" },
	{ days: 30, label: "30 days" },
	{ days: null, label: "Never" },
] as const;

export interface ShareSettings {
	enabled: boolean;
	expiresInDays: number | null;
	allowDownload: boolean;
}

export function getCloudBridge() {
	if (typeof window === "undefined") return null;
	return window.worksuite?.cloud ?? null;
}

/** The "Upload to Worksuite Cloud" choice shown before export (CL-06). */
export function ShareOptions({
	settings,
	onChange,
}: {
	settings: ShareSettings;
	onChange: (next: ShareSettings) => void;
}) {
	const { state, bridge } = useWorksuiteAccount();
	if (!getCloudBridge() || !state) return null;
	const signedIn = state.status === "signed-in";

	return (
		<div
			className="flex flex-col gap-2 rounded-md border p-3"
			data-share-options
		>
			<div className="flex items-center justify-between gap-2">
				<label className="flex items-center gap-2 text-xs">
					<input
						type="checkbox"
						className="accent-primary size-3.5"
						disabled={!signedIn}
						checked={signedIn && settings.enabled}
						onChange={(e) =>
							onChange({ ...settings, enabled: e.target.checked })
						}
					/>
					Upload to Worksuite Cloud and create a share link
				</label>
				{!signedIn && (
					<Button variant="outline" size="sm" onClick={() => bridge?.signIn()}>
						Sign in
					</Button>
				)}
			</div>
			{signedIn && settings.enabled && (
				<div className="flex flex-wrap items-center gap-1.5 pl-5">
					<span className="text-muted-foreground text-xs">Link expires</span>
					{SHARE_EXPIRY_CHOICES.map((choice) => (
						<button
							key={choice.label}
							type="button"
							onClick={() =>
								onChange({ ...settings, expiresInDays: choice.days })
							}
							className={cn(
								"rounded-md border px-2 py-0.5 text-[11px]",
								settings.expiresInDays === choice.days
									? "border-primary bg-primary/15"
									: "text-muted-foreground hover:bg-accent",
							)}
						>
							{choice.label}
						</button>
					))}
					<label className="ml-2 flex items-center gap-1.5 text-xs">
						<input
							type="checkbox"
							className="accent-primary size-3.5"
							checked={settings.allowDownload}
							onChange={(e) =>
								onChange({ ...settings, allowDownload: e.target.checked })
							}
						/>
						Allow download
					</label>
				</div>
			)}
		</div>
	);
}

/** Uploads a saved export and shows the share link (after export). */
export function ShareProgress({
	filePath,
	settings,
}: {
	filePath: string;
	settings: ShareSettings;
}) {
	const [progress, setProgress] = useState<CloudUploadProgress | null>(null);
	const [result, setResult] = useState<CloudShareResult | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		const cloud = getCloudBridge();
		if (!cloud) return;
		let live = true;
		const unsubscribe = cloud.onProgress((p) => live && setProgress(p));
		cloud
			.uploadAndShare({
				filePath,
				expiresInDays: settings.expiresInDays,
				allowDownload: settings.allowDownload,
			})
			.then((r) => live && setResult(r));
		return () => {
			live = false;
			unsubscribe();
		};
	}, [filePath, settings.expiresInDays, settings.allowDownload, attempt]);

	const cloud = getCloudBridge();

	if (result?.ok) {
		return (
			<div
				className="flex flex-col gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 p-3"
				data-share-result
			>
				<span className="flex items-center gap-1.5 text-xs font-medium">
					<Link2 className="size-3.5" /> Share link ready
				</span>
				<div className="flex items-center gap-2">
					<input
						readOnly
						value={result.url}
						className="bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-xs"
						onFocus={(e) => e.target.select()}
					/>
					<Button
						size="sm"
						onClick={async () => {
							await cloud?.copy(result.url);
							setCopied(true);
							setTimeout(() => setCopied(false), 1200);
						}}
					>
						{copied ? <Check /> : <Copy />}
						{copied ? "Copied" : "Copy link"}
					</Button>
				</div>
				<span className="text-muted-foreground text-[11px]">
					{settings.allowDownload
						? "Viewers can watch and download."
						: "Viewers can watch only."}{" "}
					{result.expiresAt
						? `Expires ${new Date(result.expiresAt).toLocaleDateString()}.`
						: "Never expires."}
				</span>
			</div>
		);
	}

	if (result && !result.ok) {
		return (
			<div
				className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
				data-share-error
			>
				<span>{result.message}</span>
				{result.code !== "denied" && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setResult(null);
							setProgress(null);
							setAttempt((n) => n + 1);
						}}
					>
						<RotateCcw />
						{result.code === "cancelled" ? "Resume" : "Retry"}
					</Button>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1.5 rounded-md border p-3">
			<div className="text-muted-foreground flex justify-between text-xs">
				<span>
					{progress?.phase === "finishing"
						? "Creating share link…"
						: "Uploading to Worksuite Cloud…"}
				</span>
				<span>{Math.round((progress?.progress ?? 0) * 100)}%</span>
			</div>
			<div className="flex items-center gap-2">
				<Progress value={(progress?.progress ?? 0) * 100} className="flex-1" />
				<Button
					variant="text"
					size="icon"
					aria-label="Cancel upload"
					onClick={() => cloud?.cancel()}
				>
					<X />
				</Button>
			</div>
		</div>
	);
}
