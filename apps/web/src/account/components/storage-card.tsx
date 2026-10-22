"use client";

import { useWorksuiteAccount } from "../use-worksuite-account";
import { formatBytes } from "./account-menu";

/** Cloud storage meter; shown only when Worksuite Cloud reports a quota. */
export function StorageCard() {
	const { state } = useWorksuiteAccount();
	const profile = state?.status === "signed-in" ? state.profile : null;
	if (!profile || profile.storageQuota == null || profile.storageUsed == null) {
		return null;
	}

	const percent = Math.min(
		100,
		Math.round((profile.storageUsed / Math.max(profile.storageQuota, 1)) * 100),
	);

	return (
		<div className="bg-popover flex flex-col gap-2 rounded-[10px] border p-3">
			<div className="text-muted-foreground text-xs">
				Cloud storage{profile.plan ? ` · ${profile.plan}` : ""}
			</div>
			<div
				className="bg-border h-1.5 rounded-full"
				role="progressbar"
				aria-valuenow={percent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Cloud storage used"
			>
				<div
					className="bg-primary h-1.5 rounded-full"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<div className="text-xs">
				{formatBytes(profile.storageUsed)} of{" "}
				{formatBytes(profile.storageQuota)}
			</div>
		</div>
	);
}
