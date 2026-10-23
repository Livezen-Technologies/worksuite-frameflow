"use client";

import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { renderCache } from "../service";
import { useRenderCacheSettings, useRenderCacheStatus } from "../store";

/** Preview toolbar: render the timeline for smooth playback, with a cached/stale strip. */
export function RenderButton() {
	const editor = useEditor();
	const mode = useRenderCacheSettings((s) => s.mode);
	const segments = useRenderCacheStatus((s) => s.segments);
	const rendering = useRenderCacheStatus((s) => s.rendering);
	if (mode === "off" || segments.length === 0) return null;
	const cached = segments.filter((s) => s === "cached").length;
	const pct = Math.round((cached / segments.length) * 100);
	return (
		<Button
			variant="text"
			size="sm"
			className="flex flex-col items-stretch gap-0.5 px-2 text-xs"
			data-render-cache-button
			title={
				rendering
					? "Rendering the preview. Click to stop."
					: `${pct}% of the timeline is rendered for smooth playback. Click to render the rest.`
			}
			onClick={() =>
				rendering
					? renderCache.cancel()
					: void renderCache.renderStale({ editor })
			}
		>
			<span>
				{rendering
					? `Rendering ${rendering.done}/${rendering.total}`
					: `Render ${pct}%`}
			</span>
			<span
				className="flex h-1 w-16 overflow-hidden rounded-full"
				aria-hidden="true"
			>
				{segments.map((state, i) => (
					<span
						// Segments have no identity beyond their position.
						key={i}
						className={cn(
							"h-full flex-1",
							state === "cached" ? "bg-constructive" : "bg-destructive/60",
						)}
					/>
				))}
			</span>
		</Button>
	);
}
