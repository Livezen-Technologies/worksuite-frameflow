"use client";

import { useEffect } from "react";
import { EditorCore } from "@/core";
import { helperBridge } from "../bridge";
import { proxyRegistry } from "../registry";
import { syncProjectProxies } from "../service";
import { useProxySettings } from "../store";

/** Keeps proxies in step with the open project's media. */
export function ProxyHost() {
	const usePreview = useProxySettings((s) => s.usePreview);
	const priority = useProxySettings((s) => s.priority);
	const concurrency = useProxySettings((s) => s.concurrency);
	const mode = useProxySettings((s) => s.mode);

	useEffect(() => proxyRegistry.setEnabled(usePreview), [usePreview]);
	useEffect(() => {
		void helperBridge()?.configure({ priority, concurrency });
	}, [priority, concurrency]);

	useEffect(() => {
		if (!helperBridge()) return;
		const editor = EditorCore.getInstance();
		let projectId: string | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const check = () => {
			const active = editor.project.getActiveOrNull()?.metadata.id ?? null;
			if (active !== projectId) {
				projectId = active;
				proxyRegistry.clear();
			}
			if (!active || editor.media.isLoadingMedia()) return;
			clearTimeout(timer);
			// New imports settle first; then queue what's missing.
			timer = setTimeout(
				() => void syncProjectProxies({ editor, projectId: active }),
				500,
			);
		};
		const offMedia = editor.media.subscribe(check);
		const offProject = editor.project.subscribe(check);
		check();
		return () => {
			offMedia();
			offProject();
			clearTimeout(timer);
		};
	}, [mode]);

	return null;
}
