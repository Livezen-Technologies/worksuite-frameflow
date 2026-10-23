"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { helperBridge } from "../bridge";
import { useProxySettings, useProxyStatus } from "../store";

const noSubscribe = () => () => {};

/** Preview toolbar: switch between proxies and original media. */
export function ProxyToggle() {
	const available = useSyncExternalStore(
		noSubscribe,
		() => !!helperBridge(),
		() => false,
	);
	const usePreview = useProxySettings((s) => s.usePreview);
	const set = useProxySettings((s) => s.set);
	const making = useProxyStatus(
		(s) =>
			Object.values(s.byMedia).filter(
				(p) => p.state === "making" || p.state === "queued",
			).length,
	);
	const ready = useProxyStatus(
		(s) => Object.values(s.byMedia).filter((p) => p.state === "ready").length,
	);
	if (!available || (ready === 0 && making === 0)) return null;
	return (
		<Button
			variant="text"
			size="sm"
			data-proxy-toggle
			aria-pressed={usePreview}
			title={
				usePreview
					? "Preview uses lightweight proxies. Export always uses the original files. Click to show originals."
					: "Preview shows the original files. Click to use proxies."
			}
			onClick={() => set({ usePreview: !usePreview })}
			className={cn(
				"gap-1 px-2 text-xs",
				usePreview ? "text-primary" : "text-muted-foreground",
			)}
		>
			Proxy {usePreview ? "on" : "off"}
			{making > 0 && (
				<span className="text-muted-foreground">· {making} making</span>
			)}
		</Button>
	);
}
