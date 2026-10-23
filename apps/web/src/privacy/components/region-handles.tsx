"use client";

import { useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import type { EffectElement } from "@/timeline";
import { clampRegion, type PrivacyRegion } from "../region";

type Grip = "move" | "nw" | "ne" | "sw" | "se";

/**
 * Drag a privacy region on the preview (SRS ED-15): the body moves it, the
 * corners resize it. Changes preview live and land as one undo step.
 */
export function RegionHandles({ trackId, element }: { trackId: string; element: EffectElement }) {
	const editor = useEditor();
	const viewport = usePreviewViewport();
	const drag = useRef<{ grip: Grip; x: number; y: number; start: PrivacyRegion } | null>(null);
	const region = element.region;
	const canvas = editor.project.getActive().settings.canvasSize;
	if (!region || !canvas) return null;

	// Region fractions → overlay pixels through the canvas's centred coordinates.
	const corner = ({ fx, fy }: { fx: number; fy: number }) =>
		viewport.positionToOverlay({ positionX: (fx - 0.5) * canvas.width, positionY: (fy - 0.5) * canvas.height });
	const topLeft = corner({ fx: region.x, fy: region.y });
	const bottomRight = corner({ fx: region.x + region.width, fy: region.y + region.height });
	const scale = viewport.getDisplayScale();

	const next = ({ event }: { event: React.PointerEvent }): PrivacyRegion | null => {
		const d = drag.current;
		if (!d) return null;
		const dx = (event.clientX - d.x) / scale.x / canvas.width;
		const dy = (event.clientY - d.y) / scale.y / canvas.height;
		const r = { ...d.start };
		if (d.grip === "move") return clampRegion({ ...r, x: r.x + dx, y: r.y + dy });
		const left = d.grip === "nw" || d.grip === "sw";
		const top = d.grip === "nw" || d.grip === "ne";
		const x0 = left ? r.x + dx : r.x;
		const x1 = left ? r.x + r.width : r.x + r.width + dx;
		const y0 = top ? r.y + dy : r.y;
		const y1 = top ? r.y + r.height : r.y + r.height + dy;
		return clampRegion({
			...r,
			x: Math.min(x0, x1),
			y: Math.min(y0, y1),
			width: Math.abs(x1 - x0),
			height: Math.abs(y1 - y0),
		});
	};

	const down = ({ event, grip }: { event: React.PointerEvent; grip: Grip }) => {
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { grip, x: event.clientX, y: event.clientY, start: region };
	};
	const move = (event: React.PointerEvent) => {
		const r = next({ event });
		if (r) editor.timeline.previewElements({ updates: [{ trackId, elementId: element.id, updates: { region: r } }] });
	};
	const up = () => {
		if (!drag.current) return;
		drag.current = null;
		editor.timeline.commitPreview();
	};

	const grips: { grip: Grip; left: number; top: number; cursor: string }[] = [
		{ grip: "nw", left: topLeft.x, top: topLeft.y, cursor: "nwse-resize" },
		{ grip: "ne", left: bottomRight.x, top: topLeft.y, cursor: "nesw-resize" },
		{ grip: "sw", left: topLeft.x, top: bottomRight.y, cursor: "nesw-resize" },
		{ grip: "se", left: bottomRight.x, top: bottomRight.y, cursor: "nwse-resize" },
	];
	return (
		<div className="pointer-events-none absolute inset-0" data-region-handles>
			<div
				className="border-primary pointer-events-auto absolute cursor-move border-2 border-dashed"
				style={{
					left: topLeft.x,
					top: topLeft.y,
					width: bottomRight.x - topLeft.x,
					height: bottomRight.y - topLeft.y,
					borderRadius: region.shape === "ellipse" ? "50%" : 0,
				}}
				onPointerDown={(event) => down({ event, grip: "move" })}
				onPointerMove={move}
				onPointerUp={up}
				onPointerCancel={up}
				data-region-body
			/>
			{grips.map((g) => (
				<div
					key={g.grip}
					className="bg-background border-primary pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2"
					style={{ left: g.left, top: g.top, cursor: g.cursor }}
					onPointerDown={(event) => down({ event, grip: g.grip })}
					onPointerMove={move}
					onPointerUp={up}
					onPointerCancel={up}
					data-region-grip={g.grip}
				/>
			))}
		</div>
	);
}
