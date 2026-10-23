"use client";

import { useEffect, useState } from "react";
import { useWorksuiteAccount } from "@/account/use-worksuite-account";
import type { NetworkState, UploadItem } from "@/account/types";

const DEFAULT: NetworkState = { offline: false, bandwidthLimit: 0 };

/** Offline mode and the upload limit (CL-08, CL-09); defaults outside the desktop app. */
export function useNetwork() {
	const [state, setState] = useState<NetworkState>(DEFAULT);
	useEffect(() => {
		const bridge = window.worksuite?.network;
		if (!bridge) return;
		const off = bridge.onChange(setState);
		bridge.getState().then(setState);
		return off;
	}, []);
	const update = (patch: Partial<NetworkState>) =>
		window.worksuite?.network?.update(patch).then(setState);
	return { ...state, available: true, update };
}

/** True when cloud features may show: signed in and not offline (CL-09). */
export function useCloudReady(): boolean {
	const { state } = useWorksuiteAccount();
	const { offline } = useNetwork();
	return state?.status === "signed-in" && !offline;
}

export function useUploads(): UploadItem[] {
	const [list, setList] = useState<UploadItem[]>([]);
	useEffect(() => {
		const bridge = window.worksuite?.uploads;
		if (!bridge) return;
		const off = bridge.onChange(setList);
		bridge.list().then(setList);
		return off;
	}, []);
	return list;
}
