"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EditorCore } from "@/core";
import { automationBridge } from "../bridge";
import { handleAutomationCall } from "../handlers";

const OPEN_TIMEOUT = 30_000;

/** Answers automation API calls forwarded by the desktop app. */
export function AutomationHost() {
	const router = useRouter();
	useEffect(() => {
		const bridge = automationBridge();
		if (!bridge) return;
		const editor = EditorCore.getInstance();
		const openProject = async (id: string) => {
			if (editor.project.getActiveOrNull()?.metadata.id === id) return;
			router.push(`/editor/${id}`);
			const started = Date.now();
			while (
				editor.project.getActiveOrNull()?.metadata.id !== id ||
				editor.project.getIsLoading()
			) {
				if (Date.now() - started > OPEN_TIMEOUT)
					throw new Error("The project didn't open in time");
				await new Promise((r) => setTimeout(r, 100));
			}
			// Media loads just after the project.
			while (editor.media.isLoadingMedia())
				await new Promise((r) => setTimeout(r, 100));
		};
		return bridge.onCall((method, params) =>
			handleAutomationCall({ ctx: { editor, openProject }, method, params }),
		);
	}, [router]);
	return null;
}
