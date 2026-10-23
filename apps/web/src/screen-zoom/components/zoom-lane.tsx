"use client";

import { useState } from "react";
import { UpdateElementsCommand } from "@/commands/timeline/element";
import { useEditor } from "@/editor/use-editor";
import type { VideoElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import { TICKS_PER_SECOND } from "@/wasm";
import { DEFAULT_ZOOM_SETTINGS, type ZoomSegment } from "../types";

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; seg: ZoomSegment };

/**
 * The Zoom track under a screen clip (SRS SC-12): each zoom is a bar you
 * can move, trim by its edges, delete (double-click), or add (double-click
 * on an empty part). Times are source seconds; the lane maps them through
 * the clip's trim and speed.
 */
export function ZoomLane({
	element,
	trackId,
	pixelsPerSecond,
}: {
	element: VideoElement;
	trackId: string;
	pixelsPerSecond: number;
}) {
	const editor = useEditor();
	const zoom = element.screenZoom;
	const [drag, setDrag] = useState<Drag | null>(null);
	const [preview, setPreview] = useState<ZoomSegment | null>(null);
	if (!zoom) return null;
	const rate = element.retime?.rate ?? 1;
	const trim = element.trimStart / TICKS_PER_SECOND;
	const length = element.duration / TICKS_PER_SECOND;
	const toPx = (sourceSeconds: number) => ((sourceSeconds - trim) / rate) * pixelsPerSecond;
	const toSource = (px: number) => trim + (px / pixelsPerSecond) * rate;
	const sourceEnd = trim + length * rate;

	const save = (segments: ZoomSegment[]) =>
		editor.command.execute({
			command: new UpdateElementsCommand({
				updates: [{ trackId, elementId: element.id, patch: { screenZoom: { ...zoom, segments } } }],
			}),
		});

	const onMove = (event: React.MouseEvent) => {
		if (!drag) return;
		const dt = ((event.clientX - drag.x0) / pixelsPerSecond) * rate;
		const s = drag.seg;
		const minLen = 0.3;
		let start = s.start;
		let end = s.end;
		if (drag.mode === "move") {
			const len = s.end - s.start;
			start = Math.min(Math.max(trim, s.start + dt), sourceEnd - len);
			end = start + len;
		} else if (drag.mode === "start") start = Math.min(Math.max(trim, s.start + dt), s.end - minLen);
		else end = Math.max(Math.min(sourceEnd, s.end + dt), s.start + minLen);
		setPreview({ ...s, start, end });
	};
	const onUp = () => {
		if (drag && preview)
			save(zoom.segments.map((z) => (z.id === drag.id ? preview : z)));
		setDrag(null);
		setPreview(null);
	};

	return (
		<div
			role="toolbar"
			aria-label="Zoom track: double-click to add a zoom"
			className="absolute inset-x-0 bottom-0 h-2.5 bg-black/25"
			data-zoom-lane
			onMouseDown={(e) => e.stopPropagation()}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
			onMouseMove={onMove}
			onMouseUp={onUp}
			onMouseLeave={onUp}
			onDoubleClick={(e) => {
				e.stopPropagation();
				const rect = e.currentTarget.getBoundingClientRect();
				const at = toSource(e.clientX - rect.left);
				const settings = zoom.settings ?? DEFAULT_ZOOM_SETTINGS;
				save([
					...zoom.segments,
					{
						id: generateUUID(),
						start: Math.max(trim, at - 1),
						end: Math.min(sourceEnd, at + 1),
						level: settings.level,
						follow: settings.follow && !!zoom.log,
						x: 0.5,
						y: 0.5,
						ease: settings.ease,
					},
				]);
			}}
		>
			{zoom.segments.map((segment) => {
				const s = preview && drag?.id === segment.id ? preview : segment;
				const left = toPx(s.start);
				const width = Math.max(4, toPx(s.end) - left);
				return (
					<button
						type="button"
						key={segment.id}
						aria-label={`Zoom ${segment.level}×, ${s.start.toFixed(1)}–${s.end.toFixed(1)} s. Delete to remove.`}
						className="absolute top-0 bottom-0 cursor-grab rounded-sm border-0 bg-cyan-400/80 p-0 hover:bg-cyan-300"
						onKeyDown={(e) => {
							if (e.key === "Delete" || e.key === "Backspace") {
								e.stopPropagation();
								save(zoom.segments.filter((z) => z.id !== segment.id));
							}
						}}
						style={{ left, width }}
						title={`Zoom ${segment.level}× · drag to move, edges to trim, double-click to delete`}
						data-zoom-segment={segment.id}
						onMouseDown={(e) => {
							e.stopPropagation();
							const edge = e.nativeEvent.offsetX;
							const mode = edge < 5 ? "start" : edge > width - 5 ? "end" : "move";
							setDrag({ id: segment.id, mode, x0: e.clientX, seg: segment });
						}}
						onDoubleClick={(e) => {
							e.stopPropagation();
							save(zoom.segments.filter((z) => z.id !== segment.id));
						}}
					/>
				);
			})}
		</div>
	);
}
