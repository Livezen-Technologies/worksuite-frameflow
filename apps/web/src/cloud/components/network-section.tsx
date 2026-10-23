"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { useNetwork } from "../network";
import {
	onMetaChange,
	readMeta,
	SYNCED_STORES,
	setSettingsSyncEnabled,
	syncSettings,
} from "../settings-sync";
import { Button } from "@/components/ui/button";

const LIMITS = [
	{ value: 0, label: "No limit" },
	{ value: 1_000_000, label: "1 MB/s" },
	{ value: 5_000_000, label: "5 MB/s" },
	{ value: 10_000_000, label: "10 MB/s" },
	{ value: 25_000_000, label: "25 MB/s" },
];

function Row({
	title,
	detail,
	children,
}: {
	title: string;
	detail: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<div className="text-sm font-medium">{title}</div>
				<div className="text-muted-foreground text-xs leading-relaxed">
					{detail}
				</div>
			</div>
			{children}
		</div>
	);
}

/** Offline mode and upload limit (CL-08, CL-09). */
export function NetworkSettings() {
	const network = useNetwork();
	if (typeof window === "undefined" || !window.worksuite?.network) return null;
	return (
		<div className="flex flex-col gap-4" data-network-settings>
			<Row
				title="Offline mode"
				detail="Stops all network traffic from FrameFlow: cloud sync, sharing, sign-in, fonts and sound search. Update checks still run unless you turn them off under Updates."
			>
				<Switch
					checked={network.offline}
					onCheckedChange={(offline) => void network.update({ offline })}
					data-offline-toggle
				/>
			</Row>
			<Row
				title="Upload speed limit"
				detail="Keeps cloud uploads from using all of your connection."
			>
				<select
					className="bg-background h-8 rounded-md border px-2 text-sm"
					value={network.bandwidthLimit}
					onChange={(e) =>
						void network.update({ bandwidthLimit: Number(e.target.value) })
					}
				>
					{LIMITS.map((l) => (
						<option key={l.value} value={l.value}>
							{l.label}
						</option>
					))}
				</select>
			</Row>
		</div>
	);
}

/** Settings sync (CL-01). */
export function SettingsSyncSection() {
	const { state } = useWorksuiteAccount();
	const { offline } = useNetwork();
	const [meta, setMeta] = useState(() =>
		typeof window === "undefined" ? null : readMeta(),
	);
	const [busy, setBusy] = useState(false);
	useEffect(() => onMetaChange(setMeta), []);
	if (state?.status !== "signed-in" || !meta) return null;
	return (
		<div className="flex flex-col gap-3" data-settings-sync>
			<Row
				title="Sync settings with your account"
				detail={`${SYNCED_STORES.map((s) => s.label).join(", ")}. The newest change wins, setting by setting.`}
			>
				<Switch
					checked={meta.enabled}
					onCheckedChange={(enabled) => {
						setSettingsSyncEnabled(enabled);
						if (enabled) void syncSettings();
					}}
				/>
			</Row>
			<div className="text-muted-foreground flex items-center justify-between text-xs">
				<span>
					{offline
						? "Paused while offline mode is on."
						: meta.lastSyncedAt
							? `Last synced ${new Date(meta.lastSyncedAt).toLocaleString()}`
							: "Not synced yet."}
				</span>
				<Button
					size="sm"
					variant="outline"
					disabled={!meta.enabled || offline || busy}
					onClick={async () => {
						setBusy(true);
						await syncSettings().finally(() => setBusy(false));
					}}
				>
					{busy ? "Syncing…" : "Sync now"}
				</Button>
			</div>
		</div>
	);
}
