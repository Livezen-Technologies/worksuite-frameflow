"use client";

import { syncSettings, watchSyncedStores } from "../settings-sync";
import { useNetwork } from "../network";
import { useEffect } from "react";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { refreshCloudProjects, syncPendingProjects } from "../sync";

const SYNC_INTERVAL_MS = 15_000;
const LIST_INTERVAL_MS = 60_000;

const SETTINGS_INTERVAL_MS = 5 * 60 * 1000;

/** Syncs edited projects in the background while signed in (CL-02, CL-09). */
export function CloudSyncRunner({
	openProjectId = null,
}: {
	openProjectId?: string | null;
}) {
	const { state } = useWorksuiteAccount();
	const { offline } = useNetwork();
	const signedIn = state?.status === "signed-in" && !offline;

	useEffect(() => {
		if (!signedIn) return;
		void refreshCloudProjects();
		void syncPendingProjects();
		const sync = setInterval(
			() => void syncPendingProjects(),
			SYNC_INTERVAL_MS,
		);
		const list = setInterval(
			() => void refreshCloudProjects(),
			LIST_INTERVAL_MS,
		);
		return () => {
			clearInterval(sync);
			clearInterval(list);
		};
	}, [signedIn, openProjectId]);

	// Settings sync (CL-01): on start, every few minutes, and after edits.
	useEffect(() => {
		if (!signedIn) return;
		void syncSettings();
		const timer = setInterval(() => void syncSettings(), SETTINGS_INTERVAL_MS);
		const unwatch = watchSyncedStores(() => void syncSettings());
		return () => {
			clearInterval(timer);
			unwatch();
		};
	}, [signedIn]);

	return null;
}
