"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/editor/use-editor";
import { helperBridge, type HelperCaps, type HelperGpu } from "../bridge";
import { PROXY_HEIGHTS, type ProxyMode } from "../rules";
import { rebuildAllProxies } from "../service";
import { useProxySettings, useProxyStatus } from "../store";

const GPU_NAMES: Record<HelperGpu, string> = {
	auto: "Automatic (best available)",
	cpu: "CPU only",
	nvidia: "NVIDIA (NVENC)",
	intel: "Intel (Quick Sync)",
	amd: "AMD (AMF)",
	apple: "Apple (VideoToolbox)",
	windows: "Windows (Media Foundation)",
	vaapi: "Linux GPU (VA-API)",
};

const MODES: { value: ProxyMode; label: string }[] = [
	{ value: "auto", label: "For clips larger than 1080p" },
	{ value: "always", label: "For every video clip" },
	{ value: "off", label: "Off" },
];

function Row({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[150px_1fr] items-start gap-3 py-2">
			<span className="pt-1.5 text-sm">{label}</span>
			<div className="flex min-w-0 flex-col gap-1">
				{children}
				{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
			</div>
		</div>
	);
}

const selectClass = "bg-accent/50 h-8 rounded-md border px-2 text-sm";

/** Project settings → Performance (SRS PS-12–PS-16). */
export function PerformanceSettings() {
	const bridge = helperBridge();
	const [caps, setCaps] = useState<HelperCaps | null>(null);
	const settings = useProxySettings();
	const editor = useEditor();
	const projectId = useEditor(
		(e) => e.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const byMedia = useProxyStatus((s) => s.byMedia);
	const all = Object.values(byMedia);
	const counts = {
		ready: all.filter((p) => p.state === "ready").length,
		making: all.filter((p) => p.state === "making" || p.state === "queued")
			.length,
		failed: all.filter((p) => p.state === "failed").length,
	};

	useEffect(() => {
		void bridge?.caps().then(setCaps);
	}, [bridge]);

	if (!bridge)
		return (
			<p className="text-muted-foreground py-3 text-sm">
				Proxies need the Worksuite FrameFlow desktop app.
			</p>
		);
	if (caps && !caps.available)
		return (
			<p className="text-muted-foreground py-3 text-sm">
				Proxies aren&apos;t available in this build: {caps.reason}
			</p>
		);

	const gpus: HelperGpu[] = [
		"auto",
		...(caps?.gpus ?? []),
		...(caps?.cpu ? (["cpu"] as const) : []),
	];

	return (
		<div className="flex flex-col" data-performance-settings>
			<Row
				label="Proxies"
				hint="Lightweight copies used for smooth editing. Export always uses the original files."
			>
				<select
					aria-label="Make proxies"
					className={selectClass}
					value={settings.mode}
					data-proxy-mode
					onChange={(e) => {
						const mode = MODES.find((m) => m.value === e.target.value)?.value;
						if (mode) settings.set({ mode });
					}}
				>
					{MODES.map((m) => (
						<option key={m.value} value={m.value}>
							{m.label}
						</option>
					))}
				</select>
			</Row>
			<Row
				label="Proxy size"
				hint="Smaller is faster; larger looks sharper in the preview."
			>
				<select
					aria-label="Proxy size"
					className={selectClass}
					value={settings.height}
					onChange={(e) => settings.set({ height: Number(e.target.value) })}
				>
					{PROXY_HEIGHTS.map((h) => (
						<option key={h} value={h}>
							{h}p
						</option>
					))}
				</select>
			</Row>
			<Row label="Preview" hint="Also on the preview toolbar.">
				<div className="flex items-center gap-2 text-sm">
					<Switch
						id="proxy-preview"
						checked={settings.usePreview}
						onCheckedChange={(v) => settings.set({ usePreview: v })}
					/>
					<Label htmlFor="proxy-preview">Use proxies in the preview</Label>
				</div>
			</Row>
			<Row
				label="Encoder"
				hint={
					caps
						? `FFmpeg ${caps.version ?? ""} (LGPL)`
						: "Checking this computer…"
				}
			>
				<select
					aria-label="Encoder"
					className={selectClass}
					value={gpus.includes(settings.gpu) ? settings.gpu : "auto"}
					onChange={(e) => {
						const gpu = gpus.find((g) => g === e.target.value);
						if (gpu) settings.set({ gpu });
					}}
				>
					{gpus.map((g) => (
						<option key={g} value={g}>
							{GPU_NAMES[g]}
						</option>
					))}
				</select>
			</Row>
			<Row
				label="Background tasks"
				hint="Low priority keeps editing and playback smooth while proxies are made."
			>
				<div className="flex items-center gap-2 text-sm">
					<Switch
						id="proxy-priority"
						checked={settings.priority === "background"}
						onCheckedChange={(v) =>
							settings.set({ priority: v ? "background" : "normal" })
						}
					/>
					<Label htmlFor="proxy-priority">Run at low priority</Label>
				</div>
				<label className="flex items-center gap-2 text-sm">
					At most
					<select
						aria-label="Jobs at once"
						className={selectClass}
						value={settings.concurrency}
						onChange={(e) =>
							settings.set({ concurrency: Number(e.target.value) })
						}
					>
						{[1, 2, 3, 4].map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
					at once
				</label>
			</Row>
			<Row label="This project">
				<span className="text-sm" data-proxy-counts>
					{counts.ready} ready
					{counts.making ? ` · ${counts.making} in progress` : ""}
					{counts.failed ? ` · ${counts.failed} failed` : ""}
				</span>
				{projectId && (
					<Button
						size="sm"
						variant="outline"
						className="self-start"
						onClick={() =>
							void rebuildAllProxies({ editor, projectId }).then(() =>
								toast.success("Rebuilding proxies"),
							)
						}
					>
						Rebuild proxies
					</Button>
				)}
			</Row>
		</div>
	);
}
