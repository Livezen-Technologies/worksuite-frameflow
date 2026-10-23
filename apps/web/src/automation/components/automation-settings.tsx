"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { automationBridge, type AutomationState } from "../bridge";

/** Settings → API: turn the local automation API on or off. */
export function AutomationSettings() {
	const bridge = automationBridge();
	const [state, setState] = useState<AutomationState | null>(null);
	useEffect(() => {
		void bridge?.getState().then(setState);
	}, [bridge]);
	if (!bridge)
		return (
			<p className="text-muted-foreground p-4 text-sm">
				The automation API runs in the desktop app.
			</p>
		);

	return (
		<div className="flex flex-col gap-4 p-4 text-sm" data-automation-settings>
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor="automation-enabled" className="font-semibold">
					Automation API
				</Label>
				<Switch
					id="automation-enabled"
					checked={!!state?.enabled}
					onCheckedChange={(on) =>
						void bridge
							.setEnabled(on)
							.then(setState)
							.catch((e: unknown) =>
								toast.error("Couldn't start the automation API", {
									description: e instanceof Error ? e.message : String(e),
								}),
							)
					}
				/>
			</div>
			<p className="text-muted-foreground text-xs">
				Lets scripts, the <code>wve</code> command and AI agents (MCP) on this
				computer create projects, import media, add clips and titles, and
				export. Only programs running as your user can connect, and they never
				see your sign-in or API keys.
			</p>
			{state?.running && (
				<div
					className="bg-accent/40 flex flex-col gap-1 rounded-md p-3 text-xs"
					data-automation-running
				>
					<span className="text-constructive">Running</span>
					<span className="text-muted-foreground break-all">
						Socket: {state.socket}
					</span>
					<span className="text-muted-foreground break-all">
						Connection file: {state.discovery}
					</span>
				</div>
			)}
			<div className="flex flex-col gap-1 text-xs">
				<span className="font-semibold">Try it</span>
				<code className="bg-accent/40 rounded p-2">wve status</code>
				<code className="bg-accent/40 rounded p-2">
					wve call project.create {'\'{"name":"Promo"}\''}
				</code>
				<span className="text-muted-foreground">
					For AI agents, add <code>wve mcp</code> as an MCP server (stdio).
				</span>
			</div>
		</div>
	);
}
