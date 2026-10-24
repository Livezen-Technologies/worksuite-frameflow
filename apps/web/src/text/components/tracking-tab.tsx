"use client";

import { useState } from "react";
import { Crosshair, Loader2, Move, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { clearTracking, trackText, videoUnder } from "@/clip-actions/tracking";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement } from "@/timeline";

/** Motion tracking (text, stickers, images, graphics): it follows an object in the video below. */
export function TrackingTab({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [progress, setProgress] = useState<number | null>(null);
	useEditor((e) => e.playback.getCurrentTime());
	const video = videoUnder({ editor, element });
	const tracked = !!element.animations?.["transform.positionX"];

	return (
		<div className="flex flex-col gap-3 p-4" data-tracking-tab>
			<span className="text-sm font-semibold">Motion tracking</span>
			<div
				className="relative aspect-video overflow-hidden rounded-xl bg-[linear-gradient(115deg,#d9e2ea_0%,#d9e2ea_22%,#2a2d33_22%,#2a2d33_78%,#d9e2ea_78%)]"
				aria-hidden
			>
				<span className="absolute top-0 bottom-0 left-[49%] w-px bg-yellow-500/70" />
				<span className="absolute top-[30%] left-[57%] h-[40%] w-[11%] rounded-[40%] bg-slate-200 shadow-md" />
				<span className="absolute top-[28%] left-[55%] flex h-[46%] w-[15%] items-center justify-center rounded-sm border-2 border-dashed border-orange-400">
					<Plus className="size-4 text-orange-400" />
				</span>
				<Move className="absolute top-[58%] left-[66%] size-9 rounded-md bg-white p-1 text-black shadow" />
				<span className="absolute top-[18%] left-[16%] rounded-md border-2 border-black bg-white px-2 py-0.5 text-xs font-bold text-black italic">
					Player No. 11
				</span>
				<span className="absolute top-[34%] left-[30%] h-px w-[25%] rotate-[18deg] bg-white" />
			</div>
			<p className="text-muted-foreground m-0 text-sm leading-relaxed">
				Drag it onto the object on the screen you want it to follow, put the
				playhead where tracking should start, then click Start.
			</p>
			{!video && (
				<p className="m-0 text-xs text-amber-400">
					No video is under it at the playhead.
				</p>
			)}
			<div className="grid grid-cols-[auto_1fr] gap-2">
				<Button
					variant="outline"
					size="icon"
					aria-label="Remove tracking"
					disabled={!tracked || progress !== null}
					onClick={() => clearTracking({ editor, text: { trackId, element } })}
				>
					<RotateCcw />
				</Button>
				<Button
					disabled={!video || progress !== null}
					data-start-tracking
					onClick={async () => {
						setProgress(0);
						try {
							const count = await trackText({
								editor,
								text: { trackId, element },
								onProgress: setProgress,
							});
							toast.success(
								`Tracked over ${count} frames. Adjust the path with the position keyframes.`,
							);
						} catch (error) {
							toast.error(
								error instanceof Error ? error.message : "Tracking failed",
							);
						} finally {
							setProgress(null);
						}
					}}
				>
					{progress !== null ? (
						<>
							<Loader2 className="animate-spin" /> Tracking…{" "}
							{Math.round(progress * 100)}%
						</>
					) : (
						<>
							<Crosshair /> Start
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
