"use client";

import { useTimelineStore } from "@/timeline/timeline-store";
import { TICKS_PER_SECOND } from "@/wasm";
import type { CurveClip } from "../speed-curve-model";
import { SpeedCurveEditor } from "./speed-curve-editor";

/**
 * Speed curve drawn over a clip on the timeline (toolbar › Speed curves).
 * Shown on clips that have a curve, and on the selected clip to start one.
 */
export function SpeedLane({
	element,
	visibleDuration,
	trackId,
	pixelsPerSecond,
	height,
	isSelected,
}: {
	/** Committed clip: edits are measured against it. */
	element: CurveClip;
	/** Duration being shown (follows live previews). */
	visibleDuration: number;
	trackId: string;
	pixelsPerSecond: number;
	height: number;
	isSelected: boolean;
}) {
	const visible = useTimelineStore((s) => s.speedCurvesVisible);
	if (!visible || (!element.retime?.curve?.length && !isSelected)) return null;
	const width = Math.max(8, (visibleDuration / TICKS_PER_SECOND) * pixelsPerSecond);
	return (
		<div
			className="absolute inset-x-0 bottom-0 z-10 bg-black/35"
			style={{ height }}
			// Keep clicks on the curve from selecting or dragging the clip.
			role="presentation"
			onMouseDown={(e) => e.stopPropagation()}
			data-speed-lane
		>
			<SpeedCurveEditor
				element={element}
				trackId={trackId}
				width={width}
				height={height}
				compact
				clipStartTime={element.startTime}
				pixelsPerTick={pixelsPerSecond / TICKS_PER_SECOND}
			/>
		</div>
	);
}
