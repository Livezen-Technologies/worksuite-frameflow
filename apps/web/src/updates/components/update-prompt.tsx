"use client";

import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdates } from "../use-updates";

/** A small pill in the header when an update is ready or available. */
export function UpdatePrompt() {
	const { state, bridge } = useUpdates();
	if (!state || !bridge) return null;
	if (state.status === "ready") {
		return (
			<Button
				size="sm"
				className="h-8 gap-1.5"
				data-update-prompt
				onClick={() => void bridge.install()}
			>
				<RefreshCw className="size-3.5" /> Restart to update to {state.version}
			</Button>
		);
	}
	if (state.status === "available" && !state.selfInstall) {
		return (
			<Button
				size="sm"
				variant="outline"
				className="h-8 gap-1.5"
				data-update-prompt
				onClick={() => void bridge.download()}
			>
				<Download className="size-3.5" /> Get version {state.version}
			</Button>
		);
	}
	return null;
}
