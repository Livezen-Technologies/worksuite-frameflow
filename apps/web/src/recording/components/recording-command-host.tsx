"use client";

import { useEffect } from "react";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useRecordingCommands } from "../commands";
import { useRecordingSettings } from "../settings";

/** Global recording shortcuts (SC-05) when the Record panel is closed. */
export function RecordingCommandHost() {
	const shortcuts = useRecordingSettings((s) => s.shortcuts);

	useEffect(() => {
		const capture = window.worksuite?.capture;
		void capture?.setShortcuts?.(shortcuts);
	}, [shortcuts]);

	useEffect(() => {
		const capture = window.worksuite?.capture;
		return capture?.onCommand?.((command) => {
			const commands = useRecordingCommands.getState();
			// The open panel handles commands itself.
			if (commands.panelOpen || command !== "toggle") return;
			if (!window.location.pathname.startsWith("/editor/")) return;
			commands.setPendingStart(true);
			useAssetsPanelStore.getState().setActiveTab("record");
		});
	}, []);

	return null;
}
