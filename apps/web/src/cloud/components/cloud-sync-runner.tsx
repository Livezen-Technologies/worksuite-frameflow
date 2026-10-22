"use client";

import { useEffect } from "react";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import { refreshCloudProjects, syncPendingProjects } from "../sync";

const SYNC_INTERVAL_MS = 15_000;
const LIST_INTERVAL_MS = 60_000;

/** Syncs edited projects in the background while signed in (CL-02, CL-09). */
export function CloudSyncRunner({
	openProjectId = null,
}: {
	openProjectId?: string | null;
}) {
	const { state } = useWorksuiteAccount();
	const signedIn = state?.status === "signed-in";

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

	return null;
}
