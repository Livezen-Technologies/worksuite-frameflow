"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderCache } from "../service";
import {
	useRenderCacheSettings,
	type CacheQuality,
	type RenderCacheMode,
} from "../store";

const MODES: { value: RenderCacheMode; label: string }[] = [
	{ value: "manual", label: "When I click Render" },
	{ value: "auto", label: "Automatically when idle" },
	{ value: "off", label: "Off" },
];
const QUALITIES: { value: CacheQuality; label: string }[] = [
	{ value: 1, label: "Full" },
	{ value: 0.5, label: "Half" },
	{ value: 0.25, label: "Quarter" },
];

const selectClass = "bg-accent/50 h-8 rounded-md border px-2 text-sm";

/** Performance tab: render cache and preview quality (PS-13, PS-14). */
export function RenderCacheSettings() {
	const { mode, quality, set } = useRenderCacheSettings();
	return (
		<>
			<div className="grid grid-cols-[150px_1fr] items-start gap-3 py-2">
				<span className="pt-1.5 text-sm">Render cache</span>
				<div className="flex flex-col gap-1">
					<select
						aria-label="Render cache"
						className={selectClass}
						value={mode}
						data-render-cache-mode
						onChange={(e) => {
							const next = MODES.find((m) => m.value === e.target.value)?.value;
							if (next) set({ mode: next });
						}}
					>
						{MODES.map((m) => (
							<option key={m.value} value={m.value}>
								{m.label}
							</option>
						))}
					</select>
					<span className="text-muted-foreground text-xs">
						Renders effects-heavy parts of the timeline ahead so they play
						smoothly. Any edit re-renders only the 2-second parts it touches.
						Export never uses the cache.
					</span>
				</div>
			</div>
			<div className="grid grid-cols-[150px_1fr] items-start gap-3 py-2">
				<span className="pt-1.5 text-sm">Preview quality</span>
				<div className="flex flex-col gap-1">
					<select
						aria-label="Preview quality"
						className={selectClass}
						value={quality}
						onChange={(e) => {
							const next = QUALITIES.find(
								(q) => q.value === Number(e.target.value),
							)?.value;
							if (next) set({ quality: next });
						}}
					>
						{QUALITIES.map((q) => (
							<option key={q.value} value={q.value}>
								{q.label}
							</option>
						))}
					</select>
					<span className="text-muted-foreground text-xs">
						Size of rendered previews. Smaller renders faster and uses less
						disk.
					</span>
					<Button
						size="sm"
						variant="outline"
						className="self-start"
						onClick={() =>
							void renderCache
								.clear()
								.then(() => toast.success("Render cache cleared"))
						}
					>
						Clear render cache
					</Button>
				</div>
			</div>
		</>
	);
}
