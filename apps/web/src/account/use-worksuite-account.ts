"use client";

import { useEffect, useState } from "react";
import type { WorksuiteAccountBridge, WorksuiteAccountState } from "./types";

export function getAccountBridge(): WorksuiteAccountBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.account ?? null;
}

/** Worksuite Cloud account state; both values stay null outside the desktop app. */
export function useWorksuiteAccount() {
	const [state, setState] = useState<WorksuiteAccountState | null>(null);

	useEffect(() => {
		const bridge = getAccountBridge();
		if (!bridge) return;
		const unsubscribe = bridge.onChange(setState);
		bridge.getState().then(setState);
		return unsubscribe;
	}, []);

	// state is only ever set when the bridge exists
	return { bridge: state ? getAccountBridge() : null, state };
}
