"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EditorCore } from "@/core";
import { automationBridge } from "../bridge";
import { handleAutomationCall } from "../handlers";
import { storageService } from "@/services/storage/service";
import { TICKS_PER_SECOND } from "@/wasm";

const OPEN_TIMEOUT = 30_000;

/** Answers automation API calls forwarded by the desktop app. */
export function AutomationHost() {
	const router = useRouter();
	useEffect(() => {
		const bridge = automationBridge();
		if (!bridge) return;
		const editor = EditorCore.getInstance();
		const openProject = async (id: string) => {
			const onPage = () =>
				window.location.pathname.startsWith(`/editor/${id}`);
			// Creating a project makes it active without opening the editor page.
			if (editor.project.getActiveOrNull()?.metadata.id === id && onPage())
				return;
			if (!onPage()) router.push(`/editor/${id}`);
			const started = Date.now();
			while (
				!onPage() ||
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
		const offCall = bridge.onCall((method, params) =>
			handleAutomationCall({ ctx: { editor, openProject }, method, params }),
		);
		// Events for subscribed clients (AU-03).
		const emit = bridge.emit ?? (() => {});
		let openId: string | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const offProject = editor.project.subscribe(() => {
			const active = editor.project.getActiveOrNull();
			const id = editor.project.getIsLoading() ? null : (active?.metadata.id ?? null);
			if (id && id !== openId) emit("project.opened", { id, name: active?.metadata.name ?? "" });
			if (!editor.project.getIsLoading()) openId = id;
		});
		const offTimeline = editor.timeline.subscribe(() => {
			const id = editor.project.getActiveOrNull()?.metadata.id ?? null;
			if (!id || id !== openId) return;
			if (timer) clearTimeout(timer);
			// One event per burst of edits.
			timer = setTimeout(() => {
				emit("timeline.changed", { id, duration: editor.timeline.getTotalDuration() / TICKS_PER_SECOND });
			}, 500);
		});
		const offSaved = storageService.onProjectChanged((id) => emit("project.saved", { id }));
		return () => {
			offCall();
			offTimeline();
			offProject();
			offSaved();
			if (timer) clearTimeout(timer);
		};
	}, [router]);
	return null;
}
