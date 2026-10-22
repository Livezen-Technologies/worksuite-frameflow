"use client";

import { useEffect, useState } from "react";
import type { UpdateState, WorksuiteUpdatesBridge } from "@/account/types";

export function getUpdatesBridge(): WorksuiteUpdatesBridge | null {
	if (typeof window === "undefined") return null;
	return window.worksuite?.updates ?? null;
}

/** Live update state from the desktop app; null in a browser. */
export function useUpdates() {
	const [state, setState] = useState<UpdateState | null>(null);
	useEffect(() => {
		const bridge = getUpdatesBridge();
		if (!bridge) return;
		const off = bridge.onChange(setState);
		void bridge.getState().then(setState);
		return off;
	}, []);
	return { state, bridge: state ? getUpdatesBridge() : null };
}
