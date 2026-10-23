"use client";

import { useState } from "react";
import { Crosshair, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { clearTracking, trackText, videoUnder } from "@/clip-actions/tracking";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import type { TextElement } from "@/timeline";

/** Text › Motion tracking: the text follows an object in the video below. */
export function TrackingTab({
	element,
	trackId,
}: {
	element: TextElement;
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
			<div className="bg-accent/40 relative flex aspect-video items-center justify-center overflow-hidden rounded-xl">
				<div className="absolute top-[38%] left-[52%] size-12 rounded border-2 border-dashed border-orange-400" />
				<span className="absolute top-[22%] left-[22%] rounded-md bg-white px-2 py-0.5 text-xs font-bold text-black italic">
					Player No. 11
				</span>
				<span className="absolute top-[30%] left-[40%] h-px w-[14%] rotate-[20deg] bg-white/70" />
			</div>
			<p className="text-muted-foreground m-0 text-sm leading-relaxed">
				Move the text onto the object you want it to follow, put the playhead
				where tracking should start, then click Start.
			</p>
			{!video && (
				<p className="m-0 text-xs text-amber-400">
					No video is under this text at the playhead.
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
